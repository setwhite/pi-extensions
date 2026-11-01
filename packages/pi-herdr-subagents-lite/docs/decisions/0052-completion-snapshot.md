# 0052 完成检测用 agent list 快照

父侧调 `herdr agent list` 读取所有 agent 的 `agent_status` 与 `completion_seq`（间隔与定位顺序见本文「修订」各段）；`completion_seq` 大于该 run 的 `lastHandledSeq` 且状态为 `idle` 或 `done` 时读子 session 尾部。每个 run 只记 `lastHandledSeq`。不订阅 herdr 事件，不维护状态机；以后若改用事件，`events.subscribe` 只服务结果投递与通知。

依据：一次调用覆盖所有 run；不需要 socket 与重连；`pane_id` 由 `agent list` 自带；herdr server 重启后下一拍自动对账。

## 修订：两档间隔与单一时钟

固定 `pollIntervalMs` 会让「收工但 `auto-exit: false` 因而仍占槽」的空闲 run 也按活跃档轮询，实测每次 `agent list` 31–46 ms，长时间空闲就是每秒一次进程启动。

改为按同一拍的结果选档：上一拍看到 run 在 working / blocked / unknown（折成 `run.busy`），或最近 30 秒内 `run` / `send` 过，用 `pollIntervalMs`；所有 live run 都只是收工等 `send`，用 `idlePollIntervalMs`（默认 8000）。代价是 pane 死亡的最晚发现时间从 `pollIntervalMs` 变成 `idlePollIntervalMs`，只影响 `pane_exited` 通知的时效，不影响结算正确性。

`run` / `send` 会重置活跃窗口，但不排 0 延迟的第一拍：首拍太早只会多一次 `agent list`。第一拍仍按 `pollIntervalMs`。

## 修订：结果只投一次

轮询路径与回执路径共用 `lastDeliveredText`：同一段文本不重复投；已经投递过结果的 run 不再报 `no_result`——那一拍只是新一轮还没写出文本，不是读失败。

## 修订：死亡只认事实

herdr 的 agent 登记在 pane 启动初期会短暂缺失：实测 domain-4 的 run 启动 1 秒后首拍就查不到它（同时 herdr server 日志在同一 pane 上两次打印 `previous_agent=None agent=Some(Pi)`），父侧当场报了 `pane_exited`，而子代理接着干了 11 分钟并交付了完整结果——结果永久丢失。

根因是拿「这一拍没有 agent 条目」当死亡。改为死亡只由事实判定：

- 有退出回执（`<session>.exit`，子扩展在 `session_shutdown` 写）→ 判死。
- `pane list` 里没有该 pane → 判死。
- 两者都没有、这一拍又查不到条目 → 保持 live、保持活跃档，满 `LOST_CHILD_MS`（10 秒）才判死。这条只为「子进程被 SIGKILL、回执写不出来、pane 又还活着」而存在，其余场景不走它。

10 秒的依据是实测：同一 pane 上 herdr 的登记抖动持续过 4 秒。被杀的进程因此最晚 10 秒报出 `pane_exited`；`auto-exit: true` 的子代理 pane 会消失，走第二条立即报出。

读重试改为记 `run.read.at`，由同一拍取最早到期时间，删掉每个 run 自己的定时器：一个进程只有一个 `setTimeout`，测试也只推一个时钟。

调度只看 state：每一拍把 `working` / `blocked` / `unknown` 折成 `run.busy`，`plan()` 不接 agent 快照，投递链抛错时也能排出下一拍。`tick` 不吞异常，只在 `finally` 里排下一拍。

仍不订阅事件：schema 里有 `PaneAgentStatusChangedEvent` 与 `EventsSubscribeParams`，但 CLI 只暴露 `agent wait`、`pane wait-output`、`api snapshot`，没有订阅命令；自建 socket 客户端要绑 protocol 版本、重连、server reload 兜底，复杂度超过省下的进程启动。实测补充：本机 Node 连 `HERDR_SOCKET_PATH` 报 `ENOTSOCK`，protocol 22 的订阅事件也没有 pane 关闭/退出三类，见 [研究 0005](../research/0005-herdr-agent-targets.md)。

## 修订：身份按 session 文件

按 pane id 定位依赖 run 记住的 pane：pane 被移动或复用后会认错 run。`agent list` 的每个条目带 `agent_session: {kind: "path", value}`，那是 herdr 自己报告的身份，不随 pane 移动与改名变化（参考项目 pi-herdr-subagents 的 `findSessionAgent` 同理）。

改为 `findAgent` 先按 session 文件匹配，再按 pane id，最后按名字。名字兜底保留，因为手写的测试替身与 `agent_session.kind !== "path"` 的条目没有 session 文件。
