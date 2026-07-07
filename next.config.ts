import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 홈 디렉터리에 있는 다른 프로젝트의 pnpm-lock.yaml 을 워크스페이스 루트로
  // 잘못 추론하는 것을 막기 위해 명시적으로 지정한다.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
