# 架构 · pi-ask-lite

## 模块

源码全在 `src/`，平铺不建子目录。测试在 `test/`，按模块镜像。包根只放配置与文档。

| 文件 | 职责 |
|---|---|
| `src/index.ts` | 入口（`package.json` 的 `pi.extensions`）与接线：读配置 → 解析参数 → `mode` 闸 → `herdr:blocked` 配对 → 挂 `ctx.ui.custom` → 收结果或中止。宿主包与渲染实现只在这里 |
| `src/config.ts` | 读 `pi-ask/config.json`、默认值、校验（含折叠键格式与冲突）、`maxHeightRatio` 夹取 |
| `src/schema.ts` | 把工具入参解析成 `Question[]`，硬错误带字段路径 |
| `src/state.ts` | 问答状态机：焦点、勾选、`note` / `custom` 草稿、折叠标志、推进、三个出口（`submit` / 提前提交 / `abort`） |
| `src/view.ts` | 行渲染与文本：Tab 栏、选项、Custom / Confirm 行、就地编辑区、preview、键提示、折叠行、宽度截断与高度预算、聊天记录的调用行与结果摘要、给模型的英文摘要 |

## 依赖方向

依赖只能按表来。反向引用不允许。

| 从 | 可以引用的本地文件 |
|---|---|
| `src/config.ts` | 无 |
| `src/schema.ts` | 无 |
| `src/state.ts` | `src/schema.ts`（仅 `import type`） |
| `src/view.ts` | `src/schema.ts`、`src/state.ts`（仅 `import type`） |
| `src/index.ts` | `src/config.ts`、`src/schema.ts`、`src/state.ts`、`src/view.ts` |

宿主包与 `node:` 的单一出口见本包 `scripts/import-graph.mjs` 的 `singleImport`：`@earendil-works/pi-coding-agent`、`@earendil-works/pi-tui`、`typebox` 只允许出现在 `src/index.ts`，`node:` 只允许 `src/config.ts` 与 `src/index.ts`。本地 `type` 边由 `typeOnlyIn` 钉住：`state.ts` 拿 `schema.ts`、`view.ts` 拿 `schema.ts` 与 `state.ts` 都必须是 `import type`。

`edges` 与上表由仓库根 `scripts/check-imports.mjs` 校验（`pnpm check:imports`）。改图时两边一起改。

为什么这么切：只有入口 import 宿主包，而且只取纯函数、组件与主题（`visibleWidth`、`truncateToWidth`、`wrapTextWithAnsi`、`getMarkdownTheme`、`Markdown`、`Text`、`Input`、`Editor`、`matchesKey`）。其余四个文件只收发普通值，测试不用 mock 宿主。类型边只借形状，不借实现，所以 `state.ts` 与 `view.ts` 仍然可以脱离宿主单测。

## 放置规则

- 语义与校验 → `schema.ts`。
- 状态迁移 → `state.ts`。任何"按了什么键之后答案怎么变"都只在这里。
- 显示与文本 → `view.ts`。宽度、高度、字形、聊天记录的调用行与结果摘要、摘要文案都在这。
- 配置键 → `config.ts`（四处同改：类型、`DEFAULTS`、校验、README 两份配置块）。
- 只有注册工具、调宿主、挂组件、发事件的文件才碰 `index.ts`。

`src/` 下不建 `utils.ts` / `types.ts` / `constants.ts`。类型跟着用它的模块走。

## 不变量

- 工具入参只在 `schema.ts` 解析一次。`Question[]` 之后的层不再校验，坏数据到不了界面。
- `Answer` 只由 `state.ts` 的出口函数造。`view.ts` 只读，不拼字段。
- 宽度与高度一律当参数传进 `view.ts`。它不读 `process.stdout`，也不 import 宿主。
- 组件只有一个出口：`done(outcome)` 只调一次。`phase` 进 `done` 之后的输入全部忽略。
- `herdr:blocked` 的 `true` 与 `false` 只在 `index.ts` 的一次 `try/finally` 里成对出现。

## 测试边界（seam）

每个模块只经一个公开边界测。

| 模块 | 测试文件 | 边界 |
|---|---|---|
| `config` | `test/config.test.ts` | `loadConfig({ configPath, env })` |
| `schema` | `test/schema.test.ts` | `parseAskInput(input, limits)` |
| `state` | `test/state.test.ts` | `createSession(questions)` 与 `reduce(session, action)` |
| `view` | `test/view.test.ts` | `renderPanel(session, layout, style)` 与 `summarize(outcome)` |
| `index` | `test/index.test.ts` | 注册的 `ToolDefinition` 与 `ctx.ui.custom` 拉起的组件；喂按键，看 `done` 的结果与事件 |

`test/index.test.ts` 用 fake api + fake ctx，不启真终端。真机冒烟见 [todo 0002](todos/0002-smoke.md)。
