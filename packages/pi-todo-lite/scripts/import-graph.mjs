/** docs/ARCHITECTURE.md「依赖方向」与「放置规则」的机读版。 */

export const root = "src";
export const moduleStyle = "file";
export const flat = true;
export const requireListed = true;
export const title = "import 图违反 docs/ARCHITECTURE.md「模块」一节：";

export const edges = {
	config: [],
	plan: [],
	view: ["plan"],
	index: ["config", "plan", "view"],
};

export const singleImport = [
	{
		specifier: /^@earendil-works\//,
		only: ["src/index.ts"],
		typeOnlyIn: ["src/index.ts"],
	},
	{ specifier: /^typebox$/, only: ["src/index.ts"] },
	{ specifier: /^node:/, only: ["src/config.ts", "src/index.ts"] },
	// 引用 plan.ts 的方向由 edges 判，这里只钉 `view.ts` 拿的是类型不是实现。
	{ specifier: /^\.\/plan\.ts$/, typeOnlyIn: ["src/view.ts"] },
];
