# 研究记录

外部行为的实测记录：herdr 与 pi 到底怎么回应、错误码是什么、边界在哪。一条实测一份文件，写清复现方式与原始输出。写代码前先读对应的记录；实测与契约冲突时改契约，不猜。

- [0001](0001-herdr-recovery-and-state.md) herdr 会话恢复与状态字段
- [0002](0002-herdr-agent-list.md) `agent.list` 的返回内容
- [0003](0003-pi-install-pack.md) `pi install` 与打包产物
- [0004](0004-herdr-workspace-create.md) `workspace.create`
- [0005](0005-herdr-agent-targets.md) agent 目标解析与 `events.subscribe`
- [0006](0006-herdr-pane-close.md) `pane.close` 与 `pane_not_found`
- [0007](0007-herdr-socket-api.md) Socket API 全量核对：NDJSON、一请求一连接、schema 字段
- [0008](0008-e2e-agent-wait-pane-close.md) 真机 e2e：pane 中途被关、`agent.wait` 的两种响应、提问闭环
- [0009](0009-agent-start-readiness.md) socket 起的托管 agent 卡在启动中，只能靠轮询 `agent.get` 推进
