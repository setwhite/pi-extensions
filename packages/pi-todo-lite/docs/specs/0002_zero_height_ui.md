# SPEC · pi-todo-lite 零行高界面改造

契约范围：移除输入框上下的 `setWidget` 展示，改为 `overlay`（非抢焦点角落浮窗 HUD）与 `status`（底栏单行 + 按需浮层）两档零行高展示。
对应旧契约：本 spec 修订 `0001-pi-todo-lite.md` 的「界面」与「不做的」中关于 `setWidget` 与 `status line` 的条目；工具协议、账本回放、`/todos` 命令与自动清空逻辑保持不变。

## 问题

`pi-todo-lite` 原先通过 `ctx.ui.setWidget` 挂在 `aboveEditor` 或 `belowEditor`，会直接吃掉对话阅读区的垂直行数。
配合输入框与 `pi-ask-lite` 等交互弹窗同时使用时，屏幕可用高度被上下夹扁，视觉也显得杂乱。
需要改为不挤占对话区垂直行数的展示方式，同时保持「不翻 transcript 就能看清进度」和「`alt+t` 一键显隐全表」的体验。

## 契约

### 1. 配置变更（`src/config.ts`，Breaking Change，升 minor 至 `0.4.0`）

- 删掉 `ui.widget.placement`（不再支持 `aboveEditor`、`belowEditor`）。
- 调整 `ui` 结构，旧键出现时按严格校验直接报错并指出新字段路径：
  - `ui.mode`: `"overlay" | "status"`，默认 `"overlay"`。
  - `ui.widget`: 保留 `enabled`、`maxLines`、`showCompleted`、`header`、`glyphs`、`completedStyle`，用于控制清单内容渲染。
  - `ui.overlay`: 仅在 `overlay` 模式（及 `status` 模式的临时弹窗）生效：
    - `anchor`: Pi 原生九宫格枚举 `"top-left" | "top-center" | "top-right" | "left-center" | "center" | "right-center" | "bottom-left" | "bottom-center" | "bottom-right"`，默认 `"top-right"`。
    - `width`: 正整数或百分比字符串，默认 `36`。
    - `minTerminalWidth`: 正整数，默认 `100`；低于此宽度时自动隐藏常驻浮窗并退回 `status` 单行。
    - `margin`: `{ top: number; right: number; bottom: number; left: number }`，默认 `{ top: 1, right: 2, bottom: 3, left: 1 }`。
  - `ui.shortcut.toggle`: 保持默认 `"alt+t"`，传 `"off"` 禁用。

### 2. 渲染与视图（`src/view.ts`）

- `renderWidget(tasks, cfg, width)` 保持纯函数与现有行预算、截断和已完成样式规则不变，供 `overlay` 与 `status` 临时弹窗复用。
- 新增纯函数 `renderStatus(tasks, cfg, maxWidth?)`:
  - `tasks` 为空返回 `undefined`。
  - 非空时返回单行字符串：`renderHeader` 结果；若存在 `in_progress` 任务，用 ` · ` 拼上第一条 `in_progress` 任务的 `content`，并按 `truncate` 截断。

### 3. 宿主接线与生命周期（`src/index.ts`）

- 彻底移除 `ctx.ui.setWidget` 调用；`scripts/import-graph.mjs` 维持 4 文件单向依赖不变。
- `ui.widget.enabled === false` 或 `!ctx.hasUI` 时，不挂载浮窗、不写 status，账本与工具逻辑不受影响。
- 模式 A（`ui.mode === "overlay"`）：
  - 通过 `ctx.ui.custom(..., { overlay: true, overlayOptions })` 挂载常驻非抢焦点浮窗（`nonCapturing: true`），透传 `anchor`、`width`、`margin`。
  - 通过 `visible(termWidth)` 控制显隐：仅在 `tasks.length > 0 && termWidth >= minTerminalWidth` 时渲染。折叠不撤浮窗，只把表压成一行。
  - 窄屏降级：`tasks.length > 0` 但 `termWidth < minTerminalWidth` 时，通过 `ctx.ui.setStatus("todo", renderStatus(...))` 在底栏保底显示一行；宽屏恢复或清空任务时清除该 status。
  - 生命周期不泄漏：挂载常驻浮窗时不得 `await` 阻塞 `session_start` 或 `restore`；持有当前浮窗的关闭句柄，在 `session_shutdown` 或切会话重新 `restore` 前先释放旧浮窗，严禁叠出重复浮窗。
- 模式 B（`ui.mode === "status"`）：
  - 平时不挂载常驻浮窗；每次 `restore`、`commit`（含工具调用、`/todos clear`、`/todos import`、自动清空）同步刷新 `ctx.ui.setStatus("todo", renderStatus(...))`。
  - 按 `alt+t` 时弹出只读浮层显示完整任务表（复用 `renderWidget`）；再按 `alt+t`、`Esc` 或 `q` 关闭浮层，焦点数归还输入框，底栏 status 保持不变。
- 快捷键语义统一：
  - `overlay` 模式下按 `alt+t` 切换 `collapsed`：折叠只收起表体，浮窗保留 `renderStatus` 那一行，不撤窗、不碰账本。
  - `status` 模式下按 `alt+t` 切换完整任务表浮层的打开与关闭（不碰账本）。

## 验收

- AC1 配置校验：单测覆盖 `ui.mode` 非法值、旧字段 `ui.widget.placement`、`ui.overlay.anchor` 非法值、`minTerminalWidth <= 0`，全部抛出带字段路径的错误；缺省配置加载返回合法默认值。命令：`pnpm -C packages/pi-todo-lite test test/config.test.ts`。
- AC2 状态行纯函数：单测覆盖 `renderStatus` 的 4 种输入——空表返回 `undefined`、有 `in_progress` 时拼接首条进行中任务、无 `in_progress` 时仅返回 header、超长内容按 `truncate` 截断带 `…`。命令：`pnpm -C packages/pi-todo-lite test test/view.test.ts`。
- AC3 `status` 模式同步与弹窗：在 `test/index.test.ts` 的 fake ctx 中验证——提交任务后 `setStatus("todo", ...)` 收到预期单行文本；清空任务后收到 `undefined`；按 `alt+t` 打开浮层、再按 `alt+t` 或 `Esc` 关闭且账本未变；全程零 `setWidget` 调用。命令：`pnpm -C packages/pi-todo-lite test test/index.test.ts`。
- AC4 `overlay` 模式挂载与防泄漏：在 `test/index.test.ts` 中验证——`overlayOptions` 正确透传 `anchor`、`width`、`margin` 与 `nonCapturing: true`；`visible(termWidth)` 在空表或 `termWidth < minTerminalWidth` 时返回 `false`，折叠时仍为 `true` 且只渲染一行；连续触发两次 `restore` 或触发 `session_shutdown` 时，旧浮窗被释放，活跃浮窗数不超过 1。命令：`pnpm -C packages/pi-todo-lite test test/index.test.ts`。
- AC5 全仓质量闸与依赖图：`pnpm check`（lint、check:imports、typecheck、test）全部通过，且 `scripts/import-graph.mjs` 未增加新模块文件。
- AC6 真机冒烟（TUI）：运行 `pi -ne -e ./packages/pi-todo-lite/src/index.ts`，在 `overlay` 模式下提交 3 条任务，确认浮窗显示在配置角落、不抢输入框焦点、不影响 `PageUp`/`PageDown` 滚屏；缩窄终端宽度小于 `minTerminalWidth` 时浮窗消失且底栏出现单行进度；按 `alt+t` 浮窗压成一行、再按恢复整表。

## 不做的

- 不保留 `aboveEditor`、`belowEditor` 与任何 `ctx.ui.setWidget` 兼容路径。
- 不在浮层内做交互式勾选、排序或编辑任务（保持只读展示）。
- 不调用 `ctx.ui.setFooter` 替换宿主整个页脚，也不针对第三方 footer 做专用适配。
- 不在 `pi-todo-lite` 与 `pi-ask-lite` 之间建立自定义事件总线耦合。
- 不改动 `todo(tasks)` 工具参数 schema、模型侧 token 开销预算、账本格式或 `/todos` 子命令集合。

## 已决（原「未决」）

- 宿主能力：`nonCapturing` 与 `visible(termWidth, termHeight)` 在 pi-tui `1.4.0`（包内 devDependency）与 `1.6.0`（本机全局 pi）都有，`ctx.ui.custom` 原样透传。证据与文件行号见 [research/0001](../research/0001-host-overlay.md)。真机 TUI 冒烟仍是 AC6。
- 默认模式：`ui.mode` 默认 `"overlay"`，由用户拍板。
