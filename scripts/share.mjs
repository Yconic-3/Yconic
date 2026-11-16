// 소리벗을 임시 공개 링크로 연다 (docs/decisions/0010).
//   1) pnpm dev 로 DB·API·AI 에이전트가 켜져 있는지 확인한다
//   2) 공개용 웹앱을 따로 빌드해 3001번에서 켠다 (API·에이전트는 웹앱이 /api, /agent 로 대신 연결)
//   3) Cloudflare 임시 터널로 https 주소를 받아 알려 준다
// 이 창을 닫거나 Ctrl+C 를 누르면 링크가 닫힌다. 다시 켜면 주소가 바뀐다.
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const WEB_PORT = Number(process.env.SHARE_PORT ?? 3001);
const isWin = process.platform === "win32";
const root = new URL("..", import.meta.url);
const webDir = new URL("apps/web/", root);

const shareEnv = {
  ...process.env,
  NEXT_PUBLIC_API_BASE_URL: "/api",
  NEXT_PUBLIC_AGENT_URL: "/agent",
  NEXT_PUBLIC_SHARE_MODE: "1",
  NEXT_DIST_DIR: ".next-share",
  NEXT_TELEMETRY_DISABLED: "1",
};

async function up(url) {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(3000) })).ok;
  } catch {
    return false;
  }
}

function findCloudflared() {
  const candidates = [process.env.CLOUDFLARED, join(homedir(), ".yconic", isWin ? "cloudflared.exe" : "cloudflared")].filter(Boolean);
  for (const c of candidates) if (existsSync(c)) return c;
  const which = spawnSync(isWin ? "where" : "which", ["cloudflared"], { encoding: "utf8" });
  return which.status === 0 ? which.stdout.split(/\r?\n/)[0].trim() : null;
}

console.log("\n  소리벗 임시 공개 링크를 엽니다.\n");

if (!(await up("http://localhost:4000/health"))) {
  console.error("  API가 꺼져 있습니다. 먼저 다른 창에서 pnpm dev (또는 실행하기.cmd)로 켜 주세요.");
  process.exit(1);
}
if (!(await up("http://localhost:4100/health"))) {
  console.warn("  AI 에이전트가 꺼져 있습니다. 말 알아듣기는 규칙 기반으로 동작합니다.");
}

const cloudflared = findCloudflared();
if (!cloudflared) {
  console.error("  cloudflared 를 찾지 못했습니다.");
  console.error("  https://github.com/cloudflare/cloudflared/releases 에서 cloudflared-windows-amd64.exe 를 받아");
  console.error(`  ${join(homedir(), ".yconic", "cloudflared.exe")} 로 저장하거나, CLOUDFLARED 환경 변수에 위치를 적어 주세요.`);
  process.exit(1);
}

console.log("  1/3 공개용 웹앱을 빌드합니다 (1~2분)…");
const build = spawnSync("pnpm", ["exec", "next", "build"], { cwd: webDir, env: shareEnv, stdio: "inherit", shell: isWin });
if (build.status !== 0) {
  console.error("  빌드에 실패했습니다. 위 오류를 확인해 주세요.");
  process.exit(1);
}

console.log(`  2/3 공개용 웹앱을 켭니다 (http://localhost:${WEB_PORT})…`);
const web = spawn("pnpm", ["exec", "next", "start", "-p", String(WEB_PORT)], { cwd: webDir, env: shareEnv, stdio: ["ignore", "inherit", "inherit"], shell: isWin });

console.log("  3/3 Cloudflare 임시 터널을 엽니다…");
const tunnel = spawn(cloudflared, ["tunnel", "--no-autoupdate", "--url", `http://localhost:${WEB_PORT}`], { stdio: ["ignore", "pipe", "pipe"] });
let announced = false;
const watchForUrl = (chunk) => {
  const m = String(chunk).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (m && !announced) {
    announced = true;
    console.log("\n  ================================================================");
    console.log(`   공개 링크: ${m[0]}`);
    console.log("   이 주소를 보내면 누구나 열 수 있습니다 (https라 마이크도 됩니다).");
    console.log("   이 창을 닫거나 Ctrl+C 를 누르면 링크가 닫힙니다. 다시 켜면 주소가 바뀝니다.");
    console.log("   관리자 계정은 공개 링크에서 로그인할 수 없습니다. AI는 하루 한도 안에서만 씁니다.");
    console.log("  ================================================================\n");
  }
};
tunnel.stdout.on("data", watchForUrl);
tunnel.stderr.on("data", watchForUrl);

let stopping = false;
const stop = () => {
  if (stopping) return;
  stopping = true;
  console.log("\n  공개 링크를 닫습니다.");
  tunnel.kill();
  if (isWin && web.pid) spawnSync("taskkill", ["/pid", String(web.pid), "/t", "/f"], { stdio: "ignore" });
  else web.kill();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
tunnel.on("exit", (code) => {
  if (!stopping) {
    console.error(`  터널이 닫혔습니다 (코드 ${code}).`);
    stop();
  }
});
web.on("exit", (code) => {
  if (!stopping) {
    console.error(`  웹앱이 꺼졌습니다 (코드 ${code}).`);
    stop();
  }
});
