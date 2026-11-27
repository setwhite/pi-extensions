/** docs/ARCHITECTURE.md §3 的可执行版本：依赖方向边表 + 单一出口。 */

export const root = "src";
export const moduleStyle = "dir";
export const exportFrom = true;
export const dynamicImport = true;
export const title = "Import graph violates docs/ARCHITECTURE.md §3:";

/** 允许的跨模块边：模块 -> 它可以直接 import 的模块（同模块内部不查）。 */
export const edges = {
  ".": ["config", "extension", "herdr"],
  config: ["config"],
  herdr: ["herdr"],
  run: ["herdr", "run"],
  tool: ["config", "run", "tool"],
  extension: ["config", "extension", "herdr", "run", "tool"],
};

/** 只允许出现在指定位置的依赖；typeOnlyIn 里的文件必须写成 `import type`。 */
export const singleImport = [
  {
    specifier: /^@earendil-works\/pi-coding-agent$/,
    only: ["src/index.ts", "src/tool/index.ts", "src/tool/input.ts", "src/extension/types.ts"],
    typeOnlyIn: ["src/index.ts", "src/tool/", "src/extension/types.ts"],
  },
  { specifier: /^typebox$/, only: ["src/tool/schema.ts", "src/tool/input.ts"] },
  { specifier: /^node:net$/, only: ["src/herdr/socket.ts"] },
  { specifier: /^node:fs$/, only: ["src/config/index.ts"] },
  {
    specifier: /^node:fs\/promises$/,
    only: ["src/run/child-result.ts", "src/run/paths.ts", "src/run/prune.ts", "src/run/result.ts"],
  },
  { specifier: /^node:path$/, only: ["src/config/index.ts", "src/run/"] },
  { specifier: /^node:os$/, only: ["src/config/index.ts", "src/run/args.ts"] },
  {
    specifier: /\.\.\/(config|herdr|run|tool|extension)\/(?!index\.ts)[a-z-]+\.ts$/,
    only: [],
  },
];
