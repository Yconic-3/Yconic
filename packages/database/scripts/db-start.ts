/**
 * 프로젝트 안에 설치된 PostgreSQL을 켠다 (Docker나 시스템 설치 없이).
 *   pnpm db:start   → 처음이면 데이터 폴더와 개발용 데이터베이스를 만들고 서버를 켠다.
 *                     Ctrl+C를 누르면 서버를 안전하게 끈다.
 *
 * PostgreSQL 실행 파일은 npm 패키지(embedded-postgres)로 설치된다. 이 스크립트는 그 실행 파일을 직접 돌린다.
 * Windows에서 프로젝트 경로에 한글이 있으면(예: 바탕 화면\지원사업) PostgreSQL이 경로를 깨뜨려 시작하지 못한다.
 * 그래서 실행 파일과 데이터를 사용자 폴더의 영문 경로(~/.yconic)에 둔다.
 *   - 실행 파일: ~/.yconic/postgres-<버전>  (경로에 한글이 있을 때만 한 번 복사)
 *   - 데이터:    ~/.yconic/pgdata-5433       (YCONIC_PGDATA 환경 변수로 바꿀 수 있다)
 */
import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { arch, homedir, platform, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import postgres from "postgres";
import { DEV_DB } from "../src/config";

const NON_ASCII = /[^\x00-\x7F]/;
const exe = platform() === "win32" ? ".exe" : "";
const yconicHome = join(homedir(), ".yconic");

/** npm으로 설치된 PostgreSQL 실행 파일 폴더(native)를 찾는다. */
function findNativeDir(): { dir: string; version: string } {
  const pkg = `@embedded-postgres/${platform() === "win32" ? "windows" : platform()}-${arch()}`;
  const fromHere = createRequire(import.meta.url);
  const fromEmbedded = createRequire(fromHere.resolve("embedded-postgres"));
  const entry = fromEmbedded.resolve(pkg); // .../<pkg>/dist/index.js
  const root = join(dirname(entry), "..");
  const version = (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version: string }).version;
  return { dir: join(root, "native"), version };
}

/** 경로에 한글 등이 있으면 영문 경로로 한 번 복사해서 그 위치를 쓴다. */
function usableBinDir(): string {
  const { dir, version } = findNativeDir();
  if (!NON_ASCII.test(dir)) return join(dir, "bin");
  const target = join(yconicHome, `postgres-${version}`);
  if (!existsSync(join(target, "bin", `postgres${exe}`))) {
    console.log(`PostgreSQL 실행 파일을 영문 경로로 복사합니다 (처음 한 번, 약 100MB): ${target}`);
    mkdirSync(yconicHome, { recursive: true });
    cpSync(dir, target, { recursive: true });
  }
  return join(target, "bin");
}

const binDir = usableBinDir();
const dataDir = process.env.YCONIC_PGDATA ?? join(yconicHome, `pgdata-${DEV_DB.port}`);

function initCluster() {
  console.log("PostgreSQL 데이터 폴더를 처음 만듭니다:", dataDir);
  mkdirSync(dirname(dataDir), { recursive: true });
  const pwfile = join(tmpdir(), `yconic-pg-${process.pid}.pw`);
  writeFileSync(pwfile, DEV_DB.password);
  try {
    const r = spawnSync(
      join(binDir, `initdb${exe}`),
      [
        "-D", dataDir,
        "-U", DEV_DB.user,
        `--pwfile=${pwfile}`,
        "--auth=scram-sha-256",
        // Windows 한국어 환경(Korean_Korea.949)에서도 같은 결과가 나오도록 인코딩과 지역 설정을 고정한다.
        "--encoding=UTF8",
        "--locale=C",
        "--lc-messages=C",
      ],
      { encoding: "utf8" },
    );
    if (r.status !== 0) {
      rmSync(dataDir, { recursive: true, force: true });
      throw new Error(`initdb 실패:\n${r.stderr || r.stdout}`);
    }
  } finally {
    rmSync(pwfile, { force: true });
  }
}

async function createDevDatabase() {
  const admin = postgres({ host: "localhost", port: DEV_DB.port, user: DEV_DB.user, password: DEV_DB.password, database: "postgres", onnotice: () => undefined });
  try {
    const rows = await admin`select 1 from pg_database where datname = ${DEV_DB.database}`;
    if (rows.length === 0) {
      await admin.unsafe(`create database "${DEV_DB.database}"`);
      console.log(`데이터베이스 "${DEV_DB.database}"를 만들었습니다. 다음으로 pnpm db:setup 을 실행하세요.`);
    }
  } finally {
    await admin.end();
  }
}

function stopServer() {
  spawnSync(join(binDir, `pg_ctl${exe}`), ["stop", "-D", dataDir, "-m", "fast", "-w"], { stdio: "ignore" });
}

async function main() {
  if (!existsSync(join(dataDir, "PG_VERSION"))) initCluster();

  const server = spawn(join(binDir, `postgres${exe}`), ["-D", dataDir, "-p", String(DEV_DB.port), "-c", "listen_addresses=localhost"], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    console.log("\nPostgreSQL을 끕니다…");
    stopServer();
    setTimeout(() => process.exit(0), 500);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  server.on("exit", (code) => {
    if (!stopping) {
      console.error(`PostgreSQL이 멈췄습니다 (code ${code}). 이미 켜져 있거나 포트 ${DEV_DB.port}를 다른 프로그램이 쓰고 있는지 확인하세요.`);
      process.exit(1);
    }
  });

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("30초 안에 시작하지 못했습니다.")), 30_000);
    const onData = (buf: Buffer) => {
      const text = buf.toString();
      if (/FATAL|PANIC/.test(text)) console.error(text.trim());
      if (text.includes("ready to accept connections")) {
        clearTimeout(timer);
        resolve();
      }
    };
    server.stdout.on("data", onData);
    server.stderr.on("data", onData);
  });

  await createDevDatabase();
  console.log(`PostgreSQL이 켜졌습니다 → postgres://${DEV_DB.user}:${DEV_DB.password}@localhost:${DEV_DB.port}/${DEV_DB.database}`);
  console.log("끄려면 Ctrl+C를 누르세요.");
}

main().catch((e) => {
  console.error("PostgreSQL을 켜지 못했습니다:", e instanceof Error ? e.message : e);
  stopServer();
  process.exit(1);
});
