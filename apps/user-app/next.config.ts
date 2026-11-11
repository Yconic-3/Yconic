import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@yconic/shared-types"],
  // 개발 도구 아이콘이 화면 아래 마이크 버튼을 가리지 않게 한다.
  devIndicators: { position: "top-right" },
};

export default nextConfig;
