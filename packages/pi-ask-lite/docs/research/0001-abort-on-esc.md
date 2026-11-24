# 0001 Esc 中止本轮：宿主路径实测

**目的**：spec 起草时，「按一次 Esc 结束本轮、不让模型再回一句」没有文档保证。三条候选路径全部实测，定死一条。同时确认 RPC 判定、Esc 焦点归属、翻页拦截、`ctrl+enter` 可辨识性。

**结论**：`ctx.abort()` + 工具结果 `terminate: true`。只发一次 provider 请求，本轮直接结束。

## 方法

用 pi-agent-core 1.4.0 的 `Agent` 加一个假 provider：

- `streamFn` 返回 `createAssistantMessageEventStream()`，第一条回复带两个工具调用（`ask` 与 `echo`），之后每条都是普通文本回复。
- 两个工具各自 `setTimeout` 后返回；`ask` 先结束，按用例决定调不调 `agent.abort()`、返不返 `terminate: true`。
- 统计 provider 请求次数、实际执行的工具、最终消息序列。
- `toolExecution: "sequential"`。脚本写在仓库 `tmp/abort-probe.mjs`（已 gitignore），不进提交。

## 结果

| 用例 | provider 请求 | 执行工具 | 最终消息 |
|---|---|---|---|
| 不处理 | 2 | `ask`、`echo` | system、user、assistant:toolUse、toolResult×2、assistant:stop |
| 只 `ctx.abort()` | 2 | `ask` | system、user、assistant:toolUse、toolResult、assistant:stop |
| 只 `terminate: true` | 2 | `ask`、`echo` | 同「不处理」 |
| `abort` + `terminate` | 1 | `ask` | system、user、assistant:toolUse、toolResult |

四条都以 `agent_end` 收尾，没有卡死。

## 源码依据

| 事实 | 位置 |
|---|---|
| 一批工具跑完才算终止：`hasMoreToolCalls = !executedToolBatch.terminate` | pi-coding-agent `dist/bundle/chunks/chunk-MM3LKT73.js` |
| `terminate` 只在一批里每个结果都为真时生效 | 同文件，批终止判定 |
| 顺序执行时信号中止只在当前调用结束后跳出循环 | 同文件，`executeToolCallsSequential` |
| `ExtensionContext.abort()` 不 await：走 `void this.abort()` | `dist/core/agent-session.js:2819` |
| `AgentSession.abort()` 内部 `await this.waitForIdle()` | `dist/core/agent-session.js` |

所以「只 abort」时宿主还会发一次 provider 请求等它被信号打断；「只 terminate」在同批有别的工具时不成立；两者叠加才是 1 次请求。

## 顺带确认的宿主行为

| 问题 | 结论 | 依据 |
|---|---|---|
| RPC 下 `ui.custom()` 能用吗 | 不能。`hasUI` 为真，但 `custom()` 直接返回 `undefined` | `docs/rpc-extension-ui.md:16,25` |
| Esc 会不会被编辑器的 `onEscape` 抢走 | 不会。`showTopExtensionDialog` 把焦点设成 custom 组件，按键只送 `focusedComponent.handleInput` | `pi-tui/dist/tui.js` 输入分发；`interactive-mode.js` `showExtensionCustom` |
| 问答期间还能翻上方对话吗 | 能。`TuiAltScreen` 在分发前拦下 PageUp / PageDown / 滚轮 | `pi-tui/dist/tui-alt-screen.js` |
| `ctrl+enter` 能收到吗 | 只在 Kitty 协议或 `modifyOtherKeys` 下能。老终端发裸 `\r`，等同 Enter | `pi-tui/dist/keys.js` `matchesKey` 的 enter 分支 |
| `herdr:blocked` 怎么算的 | 计数：`active: true` 加一、`false` 减一，`label` 取最后一次 | `~/.pi/agent/extensions/herdr-agent-state.ts:211` |

## 动工口径

- Esc 只由组件自己收，收到就进 `abort`：先 `ctx.abort()`，再返回 `{ terminate: true }`。顺序反过来也成立，但先 abort 能让同批未开始的工具尽早停。
- `custom()` 前发 `herdr:blocked` 的 `active: true`，`finally` 里发 `false`。三条路径（提交、中止、抛错）都要走到。
- 无 UI 判定用 `ctx.mode !== "tui"`，不用 `ctx.hasUI`。
- 组件不消费翻页键与滚轮。

## 没做

probe 没在真 TUI 里跑。`abort` 之后编辑框是否立即恢复、面板是否恢复，留给 AC8 真机验。
