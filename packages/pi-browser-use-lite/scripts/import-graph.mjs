/** docs/ARCHITECTURE.md §2 的可执行版本：依赖方向边表 + 四处「单一出口」。 */

export const root = "src";
export const moduleStyle = "dir";
export const requireListed = true;
export const title = "Import graph violates docs/ARCHITECTURE.md §2:";

/** 允许的跨模块边：模块 -> 它可以直接 import 的模块（同模块内部不查）。 */
export const edges = {
	".": ["bridge", "commands", "config", "policy", "tools"],
	commands: ["bridge", "policy"],
	bridge: ["protocol"],
	policy: ["config"],
	tools: ["bridge", "format", "fs", "policy", "protocol"],
	config: [],
	protocol: [],
	format: [],
	fs: [],
};

/** 只允许出现在指定位置的依赖；typeOnlyIn 里的文件必须写成 `import type`。 */
export const singleImport = [
	{
		specifier: /^@earendil-works\/pi-coding-agent$/,
		only: ["src/index.ts", "src/tools/result.ts"],
		typeOnlyIn: ["src/index.ts"],
	},
	{ specifier: /^@earendil-works\/pi-tui$/, only: ["src/tools/render.ts"] },
	{ specifier: /^node:(http|net)$/, only: ["src/bridge/"] },
	{ specifier: /^node:fs(\/|$)/, only: ["src/config/", "src/fs/"] },
];
