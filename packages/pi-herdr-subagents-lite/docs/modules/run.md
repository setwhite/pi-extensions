# run

run 生命周期内核。对外行为见 [v1 契约](../specs/0001-v1-contract.md)；本文只写取舍。

## 状态来源

- 每一拍拉一次 `agent list` 快照，先按 session 文件、再按 `paneId`、最后按 `name` 定位 run，比较 `completion_seq`（DEC-0052）。不订阅 herdr 事件：一次调用覆盖所有 run，不需要 socket 与重连，server 重启后下一拍自动对账。
- 死亡只认事实：有退出回执，或 pane 消失。两者都没有时，查不到条目只算「这拍没看见」，满 10 秒才判死（DEC-0052）。
- 只有对账，没有事件边沿：快照与 `completion_seq` 单调比较是幂等的，丢一拍下一拍补上。所以间隔只是延迟预算，正确性不依赖它。
- 两档间隔，由上一拍的结果决定：有 run 在 working / blocked / unknown（`run.busy`）、正在缺失宽限里（`run.absentSince`），或最近 30 秒内 `run` / `send` 过，用 `pollIntervalMs`；所有 live run 都只是收工等 `send`，用 `idlePollIntervalMs`。`run` / `send` 会把下一拍拉回活跃档。
- 读重试也不单独计时：记 `run.read.at`，下一拍取最早的到期时间，全进程只有一个 `setTimeout`。
- 单次 `agent list` 失败不算死亡；连续 3 拍失败才结算 `poll_failed`。读取门槛见契约 §6。

## 槽位

- run 在第一次 await 之前占槽，并发 `run()` 立刻看到它。
- `done` 且 `auto-exit: false` 的 run 仍为 live、仍占槽，`send` 才能续聊（DEC-0047）。父侧因此一直轮询，这类 run 是慢速档。
- `send` 受同一上限约束：已收工或已退出的 run 重新变成 live 之前要占槽；已满时返回 `max_concurrent`，不投递、不重启。

## send

- 只有显式 `send` 才重启，死亡不自动重启（DEC-0031）。
- 重启重读 profile，不用快照；非 `task` 模式按新 profile 重写身份文件。
- auto-exit 走 pane env（DEC-0056）。新 profile 的 `auto-exit` 与建 tab 时的值不一致时，关掉旧 tab（只在它只剩该 pane 时）并新建 tab；否则在原 pane 重新 `agent start`。
- 三类拒绝重启见契约 §5：宁可报错也不重放副作用。

## 结果与关闭

- 结果超限时消息里只留可读的头与路径，全文落 artifact；写失败仍按 `done` 投递并附警告（DEC-0036）。
- 聚合窗口 0 与非 0 的投递失败都走 `onError` → 父会话收到 `subagent result not delivered`。0 不排队，直接投递。
- `shutdown` 置 stopped 后直接丢掉在途 `start()`；`closeChildren` 会等它们结束再关 tab，避免刚关完又被创建。
- `closeChildren` 先停轮询再并发关 tab，所以不会再投 `pane_exited`；保留与失败的逐条通知由 [extension](extension.md) 发（DEC-0048）。
