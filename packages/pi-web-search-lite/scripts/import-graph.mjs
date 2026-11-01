/** docs/ARCHITECTURE.md §2 的可执行版本：依赖方向边表 + 四处「单一出口」。 */

export const root = "src";
export const moduleStyle = "dir";
export const title = "Import graph violates docs/ARCHITECTURE.md §2:";

/** 允许的跨模块边：模块 -> 它可以直接 import 的模块（同模块内部不查）。 */
export const edges = {
	".": ["config", "tools"],
	config: ["config"],
	ssrf: ["ssrf"],
	http: ["ssrf"],
	providers: ["config", "http", "providers"],
	extractors: ["config", "http", "extractors"],
	handlers: ["config", "handlers"],
	tools: ["config", "http", "ssrf", "providers", "extractors", "handlers", "tools"],
};

/** 只允许出现在指定位置的依赖；typeOnlyIn 里的文件必须写成 `import type`。 */
export const singleImport = [
	{ specifier: /^undici(\/|$)/, only: ["src/http/"] },
	{ specifier: /^node:child_process$/, only: ["src/handlers/github/"] },
	{
		specifier: /^@earendil-works\/pi-coding-agent$/,
		only: ["src/index.ts", "src/tools/result.ts"],
		typeOnlyIn: ["src/index.ts"],
	},
	{ specifier: /^@earendil-works\/pi-tui$/, only: ["src/tools/render.ts"] },
];
