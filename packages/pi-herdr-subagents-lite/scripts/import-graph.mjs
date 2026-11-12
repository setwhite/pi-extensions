/** docs/ARCHITECTURE.md §3 的可执行版本：依赖方向边表 + 单一出口。 */

export const root = "src";
export const moduleStyle = "dir";
export const exportFrom = true;
export const dynamicImport = true;
export const title = "Import graph violates docs/ARCHITECTURE.md §3:";

/** 允许的跨模块边：模块 -> 它可以直接 import 的模块（同模块内部不查）。 */
export const edges = {
  ".": ["config", "extension", "herdr", "profile", "session-file"],
  config: ["config"],
  extension: [
    "config",
    "extension",
    "error",
    "profile",
    "run",
    "herdr",
    "session-file",
    "inbox",
    "tool",
    "bridge",
    "turn",
  ],
  error: ["error"],
  tool: ["config", "profile", "run", "tool"],
  run: ["config", "error", "run", "profile", "herdr", "session-file", "inbox", "turn"],
  turn: ["turn"],
  profile: ["config", "error", "profile"],
  herdr: ["herdr"],
  "session-file": ["session-file"],
  inbox: ["inbox"],
  bridge: ["bridge", "config"],
};

/** 只允许出现在指定位置的依赖；typeOnlyIn 里的文件必须写成 `import type`。 */
export const singleImport = [
  {
    specifier: /^@earendil-works\/pi-coding-agent$/,
    only: ["src/index.ts", "src/extension/index.ts", "src/profile/", "src/tool/"],
    typeOnlyIn: ["src/index.ts", "src/extension/index.ts", "src/tool/"],
  },
  { specifier: /^typebox$/, only: ["src/tool/schema.ts"] },
  { specifier: /^node:child_process$/, only: ["src/herdr/cli.ts"] },
  {
    specifier: /^node:fs(\/|$)/,
    only: [
      "src/config/index.ts",
      "src/inbox/index.ts",
      "src/profile/layers.ts",
      "src/profile/seed.ts",
      "src/session-file/index.ts",
      "src/session-file/tail.ts",
      "src/turn/index.ts",
      "src/run/start.ts",
      "src/run/send.ts",
      "src/run/artifact.ts",
      "src/run/watch.ts",
    ],
  },
  {
    specifier: /^node:path$/,
    only: [
      "src/config/index.ts",
      "src/inbox/index.ts",
      "src/profile/index.ts",
      "src/profile/layers.ts",
      "src/profile/seed.ts",
      "src/run/index.ts",
      "src/run/pane.ts",
      "src/run/paths.ts",
      "src/run/start.ts",
      "src/run/spawn-args.ts",
      "src/turn/index.ts",
    ],
  },
  { specifier: /^node:os$/, only: ["src/run/spawn-args.ts"] },
  { specifier: /^node:crypto$/, only: ["src/inbox/index.ts", "src/run/start.ts"] },
  {
    specifier: /^\.\.\/session-file\/index\.ts$/,
    only: ["src/run/", "src/extension/"],
    typeOnlyIn: ["src/run/", "src/extension/"],
  },
  {
    specifier: /^\.\.\/(config|herdr|profile|session-file)\/index\.ts$/,
    only: ["src/extension/", "src/profile/", "src/run/", "src/tool/", "src/bridge/"],
    typeOnlyIn: ["src/extension/", "src/tool/", "src/bridge/"],
  },
];
