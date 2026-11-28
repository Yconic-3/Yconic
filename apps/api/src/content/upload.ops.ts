import type { CreateUploadInput, UploadProgress, UploadSession, UploadStatus, VideoAsset } from "@yconic/shared-types";
import { randomBytes } from "node:crypto";
import { mkdir, open, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ApiError, notFound } from "../common/errors";
import { newId } from "../common/ids";
import { uploadsDir, videosDir, type ApiConfig } from "../config";
import { safeExt, saveUploadedVideo } from "./content.ops";
import type { Db } from "./content.store";

/**
 * 영상 나눠 올리기 (shared-types upload.ts, docs/decisions/0015, 0022).
 * 조각마다 storage/uploads/<올리기 ID>/parts/<번호> 파일로 받아 두고, 다 받으면 번호 순서로 이어 붙여 영상 폴더로 옮긴다.
 * - 조각은 어떤 순서로 와도 된다. 그래서 화면이 여러 조각을 동시에 보낼 수 있다.
 * - 받은 조각은 파일로 남으므로, 연결이 끊기거나 화면을 닫았다 와도 받은 데서 이어 올릴 수 있다 (서버를 다시 켜도).
 * 권한 검사는 부르는 쪽(AdminService, MeService)이 check로 넘긴다.
 */

interface UploadMeta extends CreateUploadInput {
  id: string;
  accountId: string;
  chunkBytes: number;
  createdAt: number;
}

/** 한 사람이 동시에 올릴 수 있는 영상 수 (끝내지 않은 올리기가 쌓여 저장 공간을 채우지 않게) */
const MAX_OPEN_PER_ACCOUNT = 3;
/** 이만큼 지나도록 끝내지 않은 올리기는 지운다 */
const STALE_MS = 24 * 60 * 60 * 1000;
const UPLOAD_ID = /^up-[a-z0-9]+-[a-f0-9]+$/;
const PART_NAME = /^\d+$/;

/** 어느 주소 아래의 올리기인지 (회원 /me, 관리자 /admin) */
export type UploadScope = "me" | "admin";

// 같은 올리기를 끝내는 일(이어 붙이기)이 겹치지 않게 줄을 세운다
const finishing = new Map<string, Promise<unknown>>();
function oneAtATime<T>(id: string, work: () => Promise<T>): Promise<T> {
  const next = (finishing.get(id) ?? Promise.resolve()).then(work, work);
  const tail = next.catch(() => undefined);
  finishing.set(id, tail);
  void tail.then(() => {
    if (finishing.get(id) === tail) finishing.delete(id);
  });
  return next;
}

const dirOf = (config: ApiConfig, id: string) => join(uploadsDir(config), id);
const partsOf = (config: ApiConfig, id: string) => join(dirOf(config, id), "parts");
const partOf = (config: ApiConfig, id: string, index: number) => join(partsOf(config, id), String(index));
const chunkCountOf = (meta: UploadMeta) => Math.ceil(meta.sizeBytes / meta.chunkBytes);
const chunkSizeOf = (meta: UploadMeta, index: number) => Math.min(meta.chunkBytes, meta.sizeBytes - index * meta.chunkBytes);

async function readMeta(config: ApiConfig, id: string): Promise<UploadMeta | null> {
  try {
    return JSON.parse(await readFile(join(dirOf(config, id), "meta.json"), "utf8")) as UploadMeta;
  } catch {
    return null;
  }
}

/** 내 올리기만 찾는다. 남의 것은 없는 것처럼 답한다 */
async function findOwn(config: ApiConfig, accountId: string, id: string): Promise<UploadMeta> {
  const meta = UPLOAD_ID.test(id) ? await readMeta(config, id) : null;
  if (!meta || meta.accountId !== accountId) throw notFound("올리던 영상");
  return meta;
}

/** 받은 조각 번호 (작은 것부터). 쓰는 중인 임시 파일은 세지 않는다 */
async function receivedParts(config: ApiConfig, id: string): Promise<number[]> {
  const names = await readdir(partsOf(config, id)).catch(() => [] as string[]);
  return names
    .filter((n) => PART_NAME.test(n))
    .map(Number)
    .sort((a, b) => a - b);
}

function receivedBytesOf(meta: UploadMeta, received: number[]): number {
  const last = chunkCountOf(meta) - 1;
  return received.reduce((sum, i) => sum + (i === last ? chunkSizeOf(meta, i) : meta.chunkBytes), 0);
}

/** 오래된 올리기를 지우고, 이 사람이 올리는 중인 수를 센다 */
async function sweep(config: ApiConfig, accountId: string, now: number): Promise<number> {
  let open = 0;
  let names: string[];
  try {
    names = await readdir(uploadsDir(config));
  } catch {
    return 0;
  }
  for (const name of names) {
    if (!UPLOAD_ID.test(name)) continue;
    const meta = await readMeta(config, name);
    if (!meta || now - meta.createdAt > STALE_MS) await rm(dirOf(config, name), { recursive: true, force: true });
    else if (meta.accountId === accountId) open++;
  }
  return open;
}

/**
 * 조각을 보낼 주소 (올리기 하나의 앞부분). 서버를 바깥에서 직접 부르는 주소가 정해져 있으면(UPLOAD_PUBLIC_URL) 그쪽을 알려 준다.
 * 화면은 Vercel을 거치지 않고 서버로 바로 보낸다 (큰 영상이 Vercel의 전송량 한도를 쓰지 않게, 0022).
 */
function uploadUrlOf(config: ApiConfig, scope: UploadScope, id: string): string | null {
  return config.uploadPublicUrl ? `${config.uploadPublicUrl}/${scope}/uploads/${id}` : null;
}

export async function createUpload(
  config: ApiConfig,
  accountId: string,
  input: CreateUploadInput,
  scope: UploadScope,
  check: () => void = () => undefined,
): Promise<UploadSession> {
  check();
  if (!input.mimeType.startsWith("video/")) throw new ApiError("VALIDATION", "영상 파일만 올릴 수 있습니다.");
  if (input.sizeBytes > config.maxVideoBytes) throw new ApiError("VALIDATION", "파일이 너무 큽니다. 영상은 2GB 이하여야 합니다.");
  const now = Date.now();
  if ((await sweep(config, accountId, now)) >= MAX_OPEN_PER_ACCOUNT) {
    throw new ApiError("CONFLICT", "올리는 중인 영상이 너무 많습니다. 먼저 올리던 영상이 끝난 뒤 다시 시도해 주세요.");
  }
  const meta: UploadMeta = { ...input, id: newId("up"), accountId, chunkBytes: config.uploadChunkBytes, createdAt: now };
  await mkdir(partsOf(config, meta.id), { recursive: true });
  await writeFile(join(dirOf(config, meta.id), "meta.json"), JSON.stringify(meta));
  return { id: meta.id, chunkBytes: meta.chunkBytes, chunkCount: chunkCountOf(meta), uploadUrl: uploadUrlOf(config, scope, meta.id) };
}

/** 어디까지 받았는지. 화면이 이어 올릴 때 묻는다 */
export async function uploadStatus(config: ApiConfig, accountId: string, id: string, scope: UploadScope): Promise<UploadStatus> {
  const meta = await findOwn(config, accountId, id);
  return {
    id: meta.id,
    sizeBytes: meta.sizeBytes,
    chunkBytes: meta.chunkBytes,
    chunkCount: chunkCountOf(meta),
    received: await receivedParts(config, id),
    uploadUrl: uploadUrlOf(config, scope, meta.id),
  };
}

export async function appendChunk(config: ApiConfig, accountId: string, id: string, index: number, chunk: unknown): Promise<UploadProgress> {
  const meta = await findOwn(config, accountId, id);
  if (!Number.isInteger(index) || index < 0 || index >= chunkCountOf(meta)) throw new ApiError("VALIDATION", "조각 번호가 올바르지 않습니다.");
  if (!Buffer.isBuffer(chunk)) throw new ApiError("VALIDATION", "조각은 application/octet-stream 으로 보내 주세요.");
  if (chunk.length !== chunkSizeOf(meta, index)) throw new ApiError("VALIDATION", "조각 크기가 맞지 않습니다.");

  const part = partOf(config, id, index);
  // 이미 받은 조각을 다시 보낸 경우 (응답을 못 받아 다시 보냄): 그대로 둔다
  if (!(await stat(part).catch(() => null))) {
    // 다 쓴 뒤에 이름을 바꿔, 쓰다 만 조각이 받은 것으로 세어지지 않게 한다
    const tmp = `${part}.${randomBytes(4).toString("hex")}.tmp`;
    try {
      await writeFile(tmp, chunk);
      await rename(tmp, part);
    } catch (e) {
      await rm(tmp, { force: true });
      // 그 사이에 올리기가 끝났거나 그만둔 경우
      if (!(await readMeta(config, id))) throw notFound("올리던 영상");
      throw e;
    }
  }
  return { receivedBytes: receivedBytesOf(meta, await receivedParts(config, id)) };
}

export async function completeUpload(db: Db, config: ApiConfig, accountId: string, id: string, check: () => void = () => undefined): Promise<VideoAsset> {
  await findOwn(config, accountId, id);
  return oneAtATime(id, async () => {
    // 줄을 서 있는 사이에 먼저 끝났을 수 있다
    const meta = await findOwn(config, accountId, id);
    const count = chunkCountOf(meta);
    const received = await receivedParts(config, id);
    if (received.length !== count) {
      throw new ApiError("VALIDATION", `영상이 다 올라오지 않았습니다 (조각 ${count}개 중 ${received.length}개). 다시 시도해 주세요.`);
    }
    const filename = `${newId("v")}${safeExt(meta.fileName)}`;
    await mkdir(videosDir(config), { recursive: true });
    const target = join(videosDir(config), filename);
    const building = `${target}.part`;
    try {
      // 번호 순서로 이어 붙인다. 조각 하나(1MB 안쪽)씩 읽어 쓰므로 영상이 커도 메모리를 많이 쓰지 않는다
      const out = await open(building, "w");
      try {
        for (let i = 0; i < count; i++) await out.write(await readFile(partOf(config, id, i)));
      } finally {
        await out.close();
      }
      if ((await stat(building)).size !== meta.sizeBytes) throw new ApiError("VALIDATION", "올라온 영상의 크기가 맞지 않습니다. 다시 올려 주세요.");
      await rename(building, target);
    } catch (e) {
      await rm(building, { force: true });
      throw e;
    }
    try {
      // 기록에 실패하면 saveUploadedVideo가 옮긴 파일을 지운다
      return await saveUploadedVideo(db, config, accountId, { filename, originalname: meta.fileName, mimetype: meta.mimeType, size: meta.sizeBytes }, meta, check);
    } finally {
      await rm(dirOf(config, id), { recursive: true, force: true });
    }
  });
}

export async function cancelUpload(config: ApiConfig, accountId: string, id: string): Promise<void> {
  await findOwn(config, accountId, id);
  await oneAtATime(id, () => rm(dirOf(config, id), { recursive: true, force: true }));
}
