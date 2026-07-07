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
    },
  },
});
