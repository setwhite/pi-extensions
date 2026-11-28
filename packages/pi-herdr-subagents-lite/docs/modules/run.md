# run

子代理的生命周期：内存状态表、状态机、spawn / steer / stop / 结算。

## 结构

| 文件 | 职责 |
|---|---|
| `rules.ts` | 纯函数：id 正则、状态迁移表、占槽判定、启动前检查、摘要截断 |
| `state.ts` | `RunRecord` / `RunState` / `Wake` 类型，`targetOf` / `wakeWatch` / `clearInterrupt` / `slottedCount` |
| `spawn.ts` | 校验、建 pane（含 worktree 分支）、启动 agent、首轮 prompt、失败回滚 |
| `watch.ts` | 每个 run 一个 watcher：`agent.wait` 长等、读 `result.json`、超时重开、结算或失败 |
| `interrupt.ts` | 运行中 `steer`：确认状态后按需 esc、排队投递、重开续跑兜底 |
| `settle.ts` | 结算与失败信封，blocked 上报 |
| `steer.ts` / `stop.ts` | 对外动作，含幂等与槽位检查 |
| `errors.ts` | 把 `HerdrError` 渲染成带错误码的模型可读文本 |
| `pane.ts` | 重开 pane、关 pane |
| `result.ts` / `child-result.ts` | 结果文件契约：读、原子写、seq 单调、超限落盘、`questions.json` 保提问状态 |
| `paths.ts` / `args.ts` / `batch.ts` / `prune.ts` | 目录布局、子进程参数与环境、结算合并窗口、过期清理 |

## 用法

~~~ts
const service = createRunService({ client, runsDir, maxConcurrent: 16, excludeTools: ["ask"], summaryMaxChars: 2000, aggregateWindowMs: 500, interruptGraceMs: 3000, onProblem });
service.onBatch(deliver);
await service.spawn({ id: "alpha", objective: "review the diff" });
~~~

## 不变量

- 只有 `run` 模块改状态表；`spawn` / `steer` / `stop` 都是直白 `async/await`。
- 槽位由状态派生，`starting` / `running` / `interrupting` 占槽，没有单独的释放调用。
- 完成只认 `result.json` 的 `seq` 递增，不认 herdr 的 `done`（它实际不会出现），也不读终端文本。
- prompt 发出后 agent 可能还停在旧 `idle`：`agent.wait` 会立刻回 `agent_info`，此时没有新 `seq`。watcher 每 300ms 重读，连续 30 秒没有新 `seq` 才判 `failed`。
- 刚 `agent.start` 的 pane 要等 herdr 把托管 agent 从启动中推进到可交互（实测约 3 秒）。这个推进只发生在 `agent.get` 里，所以 `pane.ts` 的 `promptWhenReady` 先按 100ms 轮询 `getAgent` 到 `interactiveReady`（总预算 30 秒，`agent_not_found` / `agent_not_ready` 都算还在起），再 prompt；prompt 的 `agent_not_ready` 重试保留作兜底。见 [DEC-0073](../decisions/0073-agent-get-readiness-poll.md)。
- 把答案 steer 回 `needs_input` 的 run 之前先删 `questions.json`，否则子侧下一回合仍会写 `needs_input`（[DEC-0072](../decisions/0072-pending-questions-file.md)）。
- 活跃 run 的 pane 变更、超时重开与结算只有 `watch` 一个执行体：`steer` 只写 `pendingSteer` / `interruptDeadline` 并唤醒长等，不再另起 `setTimeout` 兜底。
- `steer` 前先查一次 `agent.get`：子代理已 `idle` / `done` 就不发 `esc`，直接排队等 watcher 投递；查询异常按忙碌处理，宁可多按一次 esc。
- 进入 `interrupting` 时 watcher 可能正阻塞在上一轮无超时的 `agent.wait`：`wake` 与 `interruptDeadline` 都经 `Promise.race` 打断这一轮。超过 `interruptGraceMs` 仍未 idle，由 watcher 关 pane、按原 session 重开并投递。
- `readChildResult` 之后、`settleRun` 之前重查 `generation` / 状态 / `pendingSteer`：有排队消息就先吃掉当前 `seq` 再投递，不把旧回合结算成 `done`。
- `promptWhenReady` 原地投递失败先重开续跑一次（复用原 `sessionFile`），重开重发都失败才判 `failed`。
- 同一个 run 同时只有一个 watcher；重开 pane 或重新提问用 `generation` 让旧长等结果作废。
- 模型面只给结果：`sessionFile` / `runDir` / `paneId` 不出现在任何模型可见的返回里，投影在 `tool/face.ts`（[DEC-0074](../decisions/0074-model-face-without-paths.md)）。服务层仍保留这些字段寻址。
- 会话与产物分家：产物在 `runs/<id>/`（`result.json`、`questions.json`、`output.md`），子会话在 `sessions/<id>/session.jsonl`；父代理拿到的路径只落在前者（[DEC-0075](../decisions/0075-child-session-outside-run-dir.md)）。两棵树共用 `pruneAgedDirs` 与 `runRetentionMs`。
- 不做跨会话状态持久化：父会话重载后从空表起步。
