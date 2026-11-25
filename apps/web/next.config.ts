import type { NextConfig } from "next";

// 웹앱이 API와 AI 에이전트를 대신 연결한다 (주소 /api, /agent).
// 그러면 공개 링크 하나로 웹앱·API·에이전트·영상을 모두 쓸 수 있다 (docs/decisions/0010).
const apiTarget = (process.env.API_INTERNAL_URL ?? "http://localhost:4000").replace(/\/+$/, "");
const agentTarget = (process.env.AGENT_INTERNAL_URL ?? "http://localhost:4100").replace(/\/+$/, "");

const nextConfig: NextConfig = {
  transpilePackages: ["@yconic/shared-types", "@yconic/fixtures", "@yconic/ai-common", "@yconic/user-agent"],
  // 개발 도구 아이콘이 사용자 화면의 마이크 버튼이나 관리자 화면의 버튼을 가리지 않게 끈다.
  devIndicators: false,
  // 공개 링크용 빌드는 따로 둔다 (pnpm share). 개발 서버(.next)와 섞이지 않게
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // 임시 공개 주소(Cloudflare)에서 개발 서버를 열어도 화면이 뜨게
  allowedDevOrigins: ["*.trycloudflare.com"],
  experimental: {
    // 대신 연결할 때 영상 올리기(최대 500MB)가 잘리지 않게, 맞춤 안내를 만드는 동안(수십 초) 끊기지 않게
    proxyClientMaxBodySize: "520mb",
    proxyTimeout: 180_000,
  },
  async rewrites() {
    // Vercel처럼 에이전트를 웹앱 안에서 돌리면(AGENT_IN_WEB=1) /agent 는 웹앱의 서버 함수(src/app/agent)가 맡는다.
    // 아니면 4100번 에이전트 서버로 넘긴다 (웹앱의 서버 함수보다 먼저: beforeFiles)
    const agentInWeb = process.env.AGENT_IN_WEB === "1";
    return {
      beforeFiles: agentInWeb ? [] : [{ source: "/agent/:path*", destination: `${agentTarget}/:path*` }],
      afterFiles: [{ source: "/api/:path*", destination: `${apiTarget}/:path*` }],
      fallback: [],
    };
  },
};

export default nextConfig;
