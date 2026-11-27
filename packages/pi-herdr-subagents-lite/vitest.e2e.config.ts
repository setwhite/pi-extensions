import { defineConfig } from "vitest/config";

export default defineConfig({
  // 真 herdr + 真 pi 子进程：逐文件串行，缺前置条件时由各文件自己跳过。
  test: {
    include: ["test/e2e/**/*.e2e.ts"],
    fileParallelism: false,
    testTimeout: 240_000,
    hookTimeout: 240_000,
    retry: 1,
  },
});
