/** docs/ARCHITECTURE.md「依赖方向」与「放置规则」的机读版。 */

export const root = "src";
export const moduleStyle = "file";
export const flat = true;
export const requireListed = true;
export const title = "import 图违反 docs/ARCHITECTURE.md「模块」一节：";

export const edges = {
	config: [],
	schema: [],
	state: ["schema"],
	view: ["schema", "state"],
	index: ["config", "schema", "state", "view"],
};

export const singleImport = [
	{ specifier: /^@earendil-works\/pi-coding-agent$/, only: ["src/index.ts"] },
	{ specifier: /^@earendil-works\/pi-tui$/, only: ["src/index.ts"] },
	{ specifier: /^typebox$/, only: ["src/index.ts"] },
	{ specifier: /^node:/, only: ["src/config.ts", "src/index.ts"] },
	// 本地类型边：只借形状，不借实现。
	{
		specifier: /^\.\/schema\.ts$/,
		typeOnlyIn: ["src/state.ts", "src/view.ts"],
	},
	{ specifier: /^\.\/state\.ts$/, typeOnlyIn: ["src/view.ts"] },
];
