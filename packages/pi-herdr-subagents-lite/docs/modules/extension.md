# extension

pi 适配层。不持有 run 状态。本文只写取舍。

## session_start

- 每个 session 重建 run 服务。旧服务先 shutdown，避免上一会话的 run 泄漏到新会话。
- 按 `config.enabled` 注册工具。bridge 与 inbox 泵不受它控制（DEC-0049）。
- profile 列表在注册时展开一次。运行中改 profile，`run` 与 `send` 重启时会重读。工具说明里的列表要重启 pi 才更新。

## 回合上报（子代理侧）

- `agent_settled` 时上报。只有拥有 `<runBase>.inbox` 的进程才算子代理，父会话不上报。
- 只取最后一条 user 消息之后的条目。`/tree`、压缩、重启都不能把旧答案算进这一轮。
- `classifyTurn` 只判这一轮的性质，不决定子代理之后做什么。
- 写失败只通知，不重试。父侧会按存活兜底报 `lost`。

## session_shutdown

- 先停 inbox，再取走 service。
- reason 是 `quit`、且自己是子代理时，写一个 `quit` 回合事件。`reload` 不算退出，不写。
- reason 命中 `closeChildrenOn` 时走 `closeChildren()`：关闭失败逐条通知。未命中只 `shutdown()`（DEC-0048）。

## inbox 投递

- 不转成工具结果。父模型看到的是一条用户消息，回复才有上下文。状态分支见契约 §5。
- 连续 3 拍失败时停泵并通知。没有退避，继续跑只会刷通知。
