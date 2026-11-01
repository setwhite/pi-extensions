import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["e2e/**/*.e2e.ts"],
    fileParallelism: false,
    retry: 1,
    testTimeout: 240_000,
    hookTimeout: 240_000,
  },
});
