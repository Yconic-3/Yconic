import type { CreateUploadInput, UploadProgress, UploadSession, VideoAsset } from "@yconic/shared-types";
import { mkdir, open, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ApiError, notFound } from "../common/errors";
import { newId } from "../common/ids";
import { uploadsDir, videosDir, type ApiConfig } from "../config";
import { safeExt, saveUploadedVideo } from "./content.ops";
import type { Db } from "./content.store";

/**
 * 영상 나눠 올리기 (shared-types upload.ts, docs/decisions/0015).
 * 조각을 storage/uploads/<올리기 ID>/data 에 차례로 이어 붙이고, 다 받으면 영상 폴더로 옮겨 기록한다.
 * 올리는 중인 정보는 파일(meta.json)에 두므로 서버를 다시 켜도 이어서 올릴 수 있다.
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

// 같은 올리기에 조각이 겹쳐 들어와도 차례로 쓰도록 줄을 세운다
const queues = new Map<string, Promise<unknown>>();
function inOrder<T>(id: string, work: () => Promise<T>): Promise<T> {
  const next = (queues.get(id) ?? Promise.resolve()).then(work, work);
  const tail = next.catch(() => undefined);
  queues.set(id, tail);
  void tail.then(() => {
    if (queues.get(id) === tail) queues.delete(id);
  });
  return next;
}

const dirOf = (config: ApiConfig, id: string) => join(uploadsDir(config), id);
const dataOf = (config: ApiConfig, id: string) => join(dirOf(config, id), "data");

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

export async function createUpload(config: ApiConfig, accountId: string, input: CreateUploadInput, check: () => void = () => undefined): Promise<UploadSession> {
  check();
  if (!input.mimeType.startsWith("video/")) throw new ApiError("VALIDATION", "영상 파일만 올릴 수 있습니다.");
  if (input.sizeBytes > config.maxVideoBytes) throw new ApiError("VALIDATION", "파일이 너무 큽니다. 영상은 2GB 이하여야 합니다.");
  const now = Date.now();
  if ((await sweep(config, accountId, now)) >= MAX_OPEN_PER_ACCOUNT) {
    throw new ApiError("CONFLICT", "올리는 중인 영상이 너무 많습니다. 먼저 올리던 영상이 끝난 뒤 다시 시도해 주세요.");
  }
  const meta: UploadMeta = { ...input, id: newId("up"), accountId, chunkBytes: config.uploadChunkBytes, createdAt: now };
  await mkdir(dirOf(config, meta.id), { recursive: true });
  await writeFile(dataOf(config, meta.id), "");
  await writeFile(join(dirOf(config, meta.id), "meta.json"), JSON.stringify(meta));
  return { id: meta.id, chunkBytes: meta.chunkBytes, chunkCount: Math.ceil(meta.sizeBytes / meta.chunkBytes) };
}

export async function appendChunk(config: ApiConfig, accountId: string, id: string, index: number, chunk: unknown): Promise<UploadProgress> {
  const meta = await findOwn(config, accountId, id);
  const chunkCount = Math.ceil(meta.sizeBytes / meta.chunkBytes);
  if (!Number.isInteger(index) || index < 0 || index >= chunkCount) throw new ApiError("VALIDATION", "조각 번호가 올바르지 않습니다.");
  if (!Buffer.isBuffer(chunk)) throw new ApiError("VALIDATION", "조각은 application/octet-stream 으로 보내 주세요.");
  const offset = index * meta.chunkBytes;
  const expected = Math.min(meta.chunkBytes, meta.sizeBytes - offset);
  if (chunk.length !== expected) throw new ApiError("VALIDATION", "조각 크기가 맞지 않습니다.");

  return inOrder(id, async () => {
    const received = (await stat(dataOf(config, id))).size;
    if (received < offset) throw new ApiError("CONFLICT", "앞의 조각이 아직 오지 않았습니다. 차례대로 보내 주세요.");
    // 이미 받은 조각을 다시 보낸 경우 (응답을 못 받아 다시 보냄): 그대로 둔다
    if (received >= offset + expected) return { receivedBytes: received };
    const file = await open(dataOf(config, id), "r+");
    try {
      await file.write(chunk, 0, chunk.length, offset);
      await file.truncate(offset + expected);
    } finally {
      await file.close();
    }
    return { receivedBytes: offset + expected };
  });
}

export async function completeUpload(db: Db, config: ApiConfig, accountId: string, id: string, check: () => void = () => undefined): Promise<VideoAsset> {
  const meta = await findOwn(config, accountId, id);
  return inOrder(id, async () => {
    const received = (await stat(dataOf(config, id)).catch(() => null))?.size;
    if (received === undefined) throw notFound("올리던 영상");
    if (received !== meta.sizeBytes) throw new ApiError("VALIDATION", "영상이 다 올라오지 않았습니다. 다시 시도해 주세요.");
    const filename = `${newId("v")}${safeExt(meta.fileName)}`;
    await mkdir(videosDir(config), { recursive: true });
    await rename(dataOf(config, id), join(videosDir(config), filename));
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
  await inOrder(id, () => rm(dirOf(config, id), { recursive: true, force: true }));
}
