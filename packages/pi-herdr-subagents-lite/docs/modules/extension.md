# extension

pi 装配层。按 `PI_SUBAGENT_DEPTH` 分流：深度 0 装主代理控制面，深度 >= 1 只装子代理侧。

## 结构

| 文件 | 职责 |
|---|---|
| `index.ts` | `createExtension(deps)`：深度分流 |
| `main.ts` | `session_start` 建服务与工具，`session_shutdown` 按 `closeChildrenOn` 清场 |
| `child.ts` | 注册 `request_input`，每个 `turn_end` 同步写 `result.json`；`questions.json` 在时仍写 `needs_input` |
| `deliver.ts` | 把合并后的结算渲染成一条 `followUp` 消息 |
| `types.ts` | 用到的 pi 扩展面最小契约 |

## 行为

- 主侧 `session_start`：清理过期 run 目录、建 Socket 客户端与 run 服务、注册工具。`enabled: false` 时什么都不注册。
- 结算投递走 `sendMessage(..., { triggerTurn: true, deliverAs: "followUp" })`：主回合空闲立即触发，进行中排到回合结束后。
- 子侧 `turn_end` 落盘的理由见[研究记录 0007](../research/0007-herdr-socket-api.md)：herdr 在 `agent_settled` 才上报 idle，而 `turn_end` 严格更早，父侧收到 idle 时结果文件必然已写完。
- 子侧没有 `PI_SUBAGENT_RUN_DIR` 时不注册任何东西，避免写到错误位置。

## 取舍

- 零 UI 渲染、零每轮上下文注入：状态看 herdr 侧边栏，进度靠主代理按需 `inspect`。
- 收尾直接调 `closeChildren`，不复用服务内部表。
