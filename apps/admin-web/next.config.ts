import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@yconic/shared-types"],
  // 개발 도구 아이콘이 왼쪽 아래 사이드바 버튼을 가리지 않게 한다.
  devIndicators: { position: "bottom-right" },
};

export default nextConfig;
