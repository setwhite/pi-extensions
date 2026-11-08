import { defineConfig } from "vitest/config";

/**
 * 真浏览器冒烟。与 `pnpm test` 分开：不进 CI，也不在没开浏览器的机器上跑。
 */

export default defineConfig({
	test: {
		include: ["test/e2e/**/*.e2e.ts"],
		testTimeout: 120_000,
		hookTimeout: 60_000,
	},
});
