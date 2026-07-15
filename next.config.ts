import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 홈 디렉터리에 있는 다른 프로젝트의 pnpm-lock.yaml 을 워크스페이스 루트로
  // 잘못 추론하는 것을 막기 위해 명시적으로 지정한다.
  turbopack: {
    root: path.join(__dirname),
  },
  // 서비스 워커 스크립트는 항상 최신본을 받아 업데이트가 즉시 전파되도록
  // 캐시를 끈다. public/의 기본 Cache-Control(max-age=0)만으로는 부족하다.
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
        ],
      },
    ];
  },
};

export default nextConfig;
