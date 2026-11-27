# 0071 完成通知用 agent.wait，不用 events.subscribe

子代理的完成信号改成每条 run 一个 `agent.wait` 长请求，取代契约 §3 / §6 里的订阅与重连对账。

## 为什么

实测 herdr 0.9.5 的订阅有两条硬约束：

- `pane.agent_status_changed` 必须带 `pane_id`。任何一条订阅里的 pane 不存在，服务端回 `invalid_request` 并关掉整条连接。
- prd 的 pi 集成只上报 `working` / `idle` / `blocked`，从不上报 `done`；`done` 是「idle 且没人看过」的派生状态。完成判定本来就得靠 `result.json` 的 `seq`。

也就是说订阅只能当「变了」的失效信号，还得配 `events_lost` 恢复与快照对账。子代理场景里每个 pane 的生命周期就是我们自己管的，这套机制换来的是额外两条连接和一堆竞态。

`agent.wait` 是服务端事件驱动的长请求，直接给出「这个 pane 里的 agent 进了 idle / done / blocked」。pane 中途被关时返回错误，正好映射成 `failed`。

## 规则

- 每条 run 一个 watcher，`agent.wait({target, until: ["idle", "done", "blocked"]})`，超时由 `interruptGraceMs` 之外的宽松上界兜住。
- watcher 用 `generation` 计数：重开 pane、重新提问、stop 之后，旧 wait 的返回值直接丢弃。
- 收到 idle 后仍以 `result.json` 的 `seq` 是否递增为准。没新文件每 300ms 重读，连续 30 秒没有新 `seq` 才判 `failed`：prompt 刚发出时 agent 可能还停在旧 `idle`（`agent.wait` 立刻回 `agent_info`），只看一次就会误判。
- 不订阅任何事件。断线不需要对账：下一条 RPC 自动重连。

## 代价

- 契约 §3 的 `events.subscribe` 与 §6 的重连对账条款作废，本文与[研究记录 0007](../research/0007-herdr-socket-api.md) 是现行说明。
- 一个 run 一条长请求。`maxConcurrent` 上限 64，对 herdr 服务端可接受。
- 真机 e2e 已确认：pane 中途被关时 `agent.wait` 回 `agent_not_running`（「agent is no longer running in the target pane」），归到 `failed`，见[研究记录 0008](../research/0008-e2e-agent-wait-pane-close.md)。

## 否决的替代

- 保留订阅 + `session.snapshot` 对账：任一条订阅带失效 pane 就整条连接被关，子代理频繁开关 pane 的场景里恢复成本高于收益。
- 轮询 `agent.list`：与契约「零轮询」直接冲突，且每 15 秒一次的延迟不适合完成通知。
