import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
	// test/e2e 由 pnpm test:e2e 单独拉起，默认套件不碰。
	test: {
		include: ["test/**/*.test.ts"],
		exclude: [...configDefaults.exclude, "test/e2e/**"],
	},
});
