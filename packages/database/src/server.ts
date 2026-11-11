/**
 * npm으로 설치된 PostgreSQL 실행 파일(embedded-postgres)을 직접 돌린다.
 * pnpm db:start 와 API 테스트(임시 데이터베이스)가 함께 쓴다.
 *
 * Windows에서 프로젝트 경로에 한글이 있으면(예: 바탕 화면\지원사업) PostgreSQL이 경로를 깨뜨려 시작하지 못한다.
 * 그래서 경로에 한글 등이 있으면 실행 파일을 사용자 폴더의 영문 경로(~/.yconic)로 한 번 복사해서 쓴다.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { arch, homedir, platform, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import postgres from "postgres";

const NON_ASCII = /[^\x00-\x7F]/;
const exe = platform() === "win32" ? ".exe" : "";
export const YCONIC_HOME = join(homedir(), ".yconic");

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

/** 실행 파일 폴더(bin). 경로에 한글 등이 있으면 영문 경로로 한 번 복사한다. */
export function postgresBinDir(log: (msg: string) => void = console.log): string {
  const { dir, version } = findNativeDir();
  if (!NON_ASCII.test(dir)) return join(dir, "bin");
  const target = join(YCONIC_HOME, `postgres-${version}`);
  if (!existsSync(join(target, "bin", `postgres${exe}`))) {
    log(`PostgreSQL 실행 파일을 영문 경로로 복사합니다 (처음 한 번, 약 100MB): ${target}`);
    mkdirSync(YCONIC_HOME, { recursive: true });
    cpSync(dir, target, { recursive: true });
  }
  return join(target, "bin");
}

export interface PostgresServerOptions {
  dataDir: string;
  port: number;
  user: string;
  password: string;
  /** 서버를 켠 뒤 이 이름의 데이터베이스가 없으면 만든다 */
  database: string;
  log?: (msg: string) => void;
}

export interface PostgresServer {
  /** 이번에 데이터 폴더를 새로 만들었는지 */
  fresh: boolean;
  /** 이번에 데이터베이스를 새로 만들었는지 */
  createdDatabase: boolean;
  process: ChildProcess;
  stop(): void;
}

export async function startPostgres(opts: PostgresServerOptions): Promise<PostgresServer> {
  const log = opts.log ?? console.log;
  const binDir = postgresBinDir(log);
  const fresh = !existsSync(join(opts.dataDir, "PG_VERSION"));

  if (fresh) {
    log(`PostgreSQL 데이터 폴더를 처음 만듭니다: ${opts.dataDir}`);
    mkdirSync(dirname(opts.dataDir), { recursive: true });
    const pwfile = join(tmpdir(), `yconic-pg-${process.pid}-${opts.port}.pw`);
    writeFileSync(pwfile, opts.password);
    try {
      const r = spawnSync(
        join(binDir, `initdb${exe}`),
        [
          "-D", opts.dataDir,
          "-U", opts.user,
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
        rmSync(opts.dataDir, { recursive: true, force: true });
        throw new Error(`initdb 실패:\n${r.stderr || r.stdout}`);
      }
    } finally {
      rmSync(pwfile, { force: true });
    }
  }

  const child = spawn(join(binDir, `postgres${exe}`), ["-D", opts.dataDir, "-p", String(opts.port), "-c", "listen_addresses=localhost"], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    spawnSync(join(binDir, `pg_ctl${exe}`), ["stop", "-D", opts.dataDir, "-m", "fast", "-w"], { stdio: "ignore" });
    if (child.exitCode === null) child.kill();
  };

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("30초 안에 시작하지 못했습니다.")), 30_000);
      const onData = (buf: Buffer) => {
        const text = buf.toString();
        if (text.includes("ready to accept connections")) {
          clearTimeout(timer);
          resolve();
        } else if (/FATAL|PANIC/.test(text)) {
          log(text.trim());
        }
      };
      child.stdout?.on("data", onData);
      child.stderr?.on("data", onData);
      child.on("exit", (code) => {
        clearTimeout(timer);
        reject(new Error(`PostgreSQL이 바로 멈췄습니다 (code ${code}). 이미 켜져 있거나 포트 ${opts.port}를 다른 프로그램이 쓰고 있는지 확인하세요.`));
      });
    });
  } catch (e) {
    stop();
    throw e;
  }

  const admin = postgres({ host: "localhost", port: opts.port, user: opts.user, password: opts.password, database: "postgres", onnotice: () => undefined });
  let createdDatabase = false;
  try {
    const rows = await admin`select 1 from pg_database where datname = ${opts.database}`;
    if (rows.length === 0) {
      await admin.unsafe(`create database "${opts.database}"`);
      createdDatabase = true;
    }
  } finally {
    await admin.end();
  }

  return { fresh, createdDatabase, process: child, stop };
}
