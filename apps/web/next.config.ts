import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@yconic/shared-types"],
  // 개발 도구 아이콘이 사용자 화면의 마이크 버튼이나 관리자 화면의 버튼을 가리지 않게 끈다.
  devIndicators: false,
};

export default nextConfig;
