import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // .claude/worktrees/ holds full nested checkouts of this repo (used for
    // isolated agent work) — without this, `eslint .` recurses into them and
    // lints stale/duplicate copies of every source file alongside the real
    // ones (same root cause as the Vitest exclude in vitest.config.ts).
    ".claude/worktrees/**",
  ]),
]);

export default eslintConfig;
