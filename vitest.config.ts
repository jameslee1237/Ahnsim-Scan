import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    // Vitest 4 exits non-zero on zero matching test files by default. Task 1
    // runs `npm test` before any test files exist; every task from Task 2
    // onward adds real tests, so this only matters for that one moment.
    passWithNoTests: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // 'server-only'는 Next.js 번들러가 'react-server' export 조건으로 해석할 때만
      // 빈 모듈이 되고, 그 외(Vitest의 Node 환경 포함)에서는 항상 에러를 throw하도록
      // 만들어진 마커 패키지다. 서버 전용 모듈을 테스트에서도 import할 수 있도록
      // 빈 구현(empty.js)으로 명시적으로 대체한다.
      'server-only': path.resolve(__dirname, 'node_modules/server-only/empty.js'),
    },
  },
});
