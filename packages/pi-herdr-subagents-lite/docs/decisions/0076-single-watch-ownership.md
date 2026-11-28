# 0076 watcher 单循环独占 pane 变更

活跃 run 的 pane 原来有三个执行体：`steer` 发 `esc`、`watch` 的长等与结算、独立的 `setTimeout` 兜底。三者并发改同一个 `RunRecord` / pane，真机故障是子代理刚写完结果就被 `esc` 撞车，watcher 把旧回合结算成 `done` 并关掉 pane；`submitPending` 原地投递失败又直接判 `failed`，pane 留在侧边栏。

## 规则

- 活跃 run 的 pane 变更、超时重开与结算只在 `watch` 单循环里发生。`steer` 只写 `pendingSteer` / `interruptDeadline` 并唤醒长等，不再自己起 `setTimeout` 兜底。
- `steer` 先查一次 `agent.get`：子代理已 `idle` / `done` 就不发 `esc`，直接排队等 watcher 投递；查询异常按忙碌处理。
- watcher 用 `Promise.race([agent.wait, wake, delay(deadline)])` 打断本轮长等：`wake` 让刚进入 `interrupting` 的循环立刻重算截止时刻，超过 `interruptGraceMs` 由它自己关 pane、按原 session 重开并投递。
- `readChildResult` 之后、`settleRun` 之前重查 `generation` / 状态 / `pendingSteer`：有排队消息就先吃掉当前 `seq` 再投递，不结算旧回合。
- `promptWhenReady` 原地失败先走一次重开续跑，重开重发都失败才 `failed`。

## 代价

- 被 `wake` 抢先的那条 `agent.wait` 请求仍在 socket 上，直到 herdr 状态变化或 pane 被关才收尾；一个 run 因此可能短暂并行两条长请求。
- `RunRecord` 多出 `interruptDeadline` 与 `wake` 两个字段；state.ts 的状态集合本身没变。
