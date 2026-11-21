# herdr

本模块是 `HerdrHost` 端口与唯一真实适配器。CLI 全部用 `execFile` 的 argv，不经 shell。本文只写取舍。

## 调用

- `workspace create` 返回 workspace、初始 tab 与 root pane。跨 cwd 的 run 直接复用这套结果，再 `tab rename` 把初始 tab 的 label 从序号改成 `name`。不追加第二个 tab（[实测](../research/0004-herdr-workspace-create.md)）。关掉 workspace 的最后一个 tab 后，herdr 移除该 workspace。
- `workspace create` 与 `tab create` 不传 `--env`。子代理用自己的 session 主名拼 run 基名，不靠环境变量找（DEC-0062）。
- 启动只有 `agent start` 一步。它在子代理 idle 时才算就绪，命令自身 30s 上限。brief 不放进启动 argv，也不打字进输入框。它是 inbox 的第一条消息，且在 `agent start` 返回后才入队（DEC-0023、DEC-0026）。
- 关闭只发 `pane close <paneId>`，不先读 tab 快照。`pane_not_found` 视为已关掉。关掉 tab 的最后一个 pane 时 herdr 自己移除 tab（DEC-0060，[实测](../research/0006-herdr-pane-close.md)）。
- `listAgents` 一次调用覆盖所有 agent。父侧只在存活对账与 send 前查它，不再当结果来源。字段依据见 [agent list 实测](../research/0002-herdr-agent-list.md)。

## 边界

- 每条命令都有超时。查询（`agent list`、`pane list`）20 秒，超时当这一拍没数据，下一拍重来；变更（`tab create`、`agent start`、`pane close`）120 秒，超时报 `herdr_timeout`，文案说明「可能已经生效，先去 tab 确认」。变更超时留下的是「不知道」，不是「失败」。
- 120 秒 > `agent start` 自己的 30 秒上限，正常启动不会被我们打断。
- 工具调用的 abort 信号一路传到 `execFile`，中止即杀子进程。中止与父会话关闭走同一条 `cancelled()` 路径：关掉已建的 pane，释放 run 记录（DEC-0067）。

## 错误

- `agent_name_taken` 归一成 `name_taken`。命名重试只关心这一种冲突，其余错误原样抛出。
- 非法 JSON 或没有 `result` 归为 `herdr_protocol`，不猜。
- 超时归 `herdr_timeout`，中止归 `aborted`。都不复用 `timeout`：那个 code 专指 `agent start` 等 idle 等超了，提示语完全不同。
