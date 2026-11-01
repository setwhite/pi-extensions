# 0005 herdr agent 目标解析与事件订阅实测

研究记录；当前契约见 [v1 契约](../specs/0001-v1-contract.md)，完成检测决策见 [DEC-0052](../decisions/0052-completion-snapshot.md)。

日期 2026-10-31。环境：herdr 0.9.5，Windows + git-bash，protocol 22，pi integration v9。父会话在默认会话 `wP` 里跑，7 个 live 子代理由本扩展启动。

## 按名字的目标解析不可用

`agent list` 里 `domain-4` 的 `name`、`pane_id`、`agent_status`、`interactive_ready` 都齐全，但所有按目标解析的命令都报 `agent_not_found`：

~~~bash
herdr agent get domain-4
# {"error":{"code":"agent_not_found","message":"agent target domain-4 not found"}}

herdr agent get wP:p5        # 换成 pane id
herdr agent get wP:t5        # 换成 tab id
herdr agent explain domain-4
herdr agent rename domain-4 domain-4
# 全部 agent_not_found
~~~

结论：在本仓库的父会话里，存在性判断只能靠 `agent list` 快照，不能靠 `agent get` 的 `agent_not_found` 判死。参考项目 pi-herdr-subagents（fyang93）把 `agent_not_found` 当作「子代理已退出」的唯一权威信号（`agentStatus()` 返回 `"exited"`）。

差异未定论：研究 0001 在隔离的 named session（`herdr --session u16test`）里，同一个 `agent get tester` 是能用的。差别可能在默认 session 与 isolated session，或在该 session 里 agent 的启动参数。结论因此只取窄的一条：本仓库的父会话（默认 session）里不可依赖。

## socket 事件订阅在本机不可用

`HERDR_SOCKET_PATH` 在父进程环境里存在（`C:\Users\...\herdr.sock`），但 Node `net.createConnection(path)` 直接报 `ENOTSOCK`：

~~~text
connect ENOTSOCK C:UsersCharles LiuAppDataRoamingherdrherdr.sock
~~~

参考项目用同一个路径建 socket 订阅，失败时静默退回轮询（`notify(false)`）。本机属于退回轮询的那一档。

另外 protocol 22 的 `subscription_event` 只定义三种事件：`PaneAgentStatusChangedEvent`、`PaneOutputMatchedEvent`、`PaneScrollChangedEvent`。参考项目订阅的 `pane.closed`、`pane.exited`、`pane.moved` 不存在于该联合类型里；这三类只在 `event`（`events.wait` 的 match 目标）里出现：

~~~text
workspace_created … pane_created, pane_closed, pane_updated, pane_focused, pane_moved,
pane_output_changed, pane_exited, pane_agent_detected, pane_agent_status_changed, layout_updated
~~~

## agent list 自带 session 报告

每个 agent 条目都带 `agent_session: {kind: "path", value: <会话文件>}`。参考项目用它做身份匹配（`findSessionAgent`），注释写明理由：「the name follows the agent when its pane moves, a pane id does not」。本项目已采用：`findAgent` 先按 session 文件匹配，再按 pane id，最后按名字。

## 参考项目其余做法与本项目的取舍

| 参考做法 | 本项目 |
|---|---|
| `agent get` 的 `agent_not_found` 判死 | 不采用：本仓库的父会话里恒报 not found |
| 连续两次缺失才算退出 | 不采用：这一拍没有条目不是事实。死亡只认回执或 pane 消失，两者都没有时只给 10 秒租约（DEC-0052） |
| `.exit` 回执出现后再等 `exitGrace` 30 秒才收尾 | 不采用：回执由本扩展在 `session_shutdown` 写，此时 assistant 文本已落盘 |
| socket 事件 + 轮询兜底 | 不采用：本机 ENOTSOCK；协议里也没有 pane 生命周期订阅事件 |
| 按 session 文件认身份 | 采用（`src/run/find.ts`） |
