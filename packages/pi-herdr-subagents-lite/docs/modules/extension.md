# extension

pi 适配层，不持有 run 状态。本文只写取舍。

## session_start

- 每个 session 重建 run 服务；旧服务先 shutdown，避免上一会话的 run 泄漏到新会话。
- 按 `config.enabled` 注册工具；bridge 与 inbox 泵不受它控制（DEC-0049）。
- profile 列表在注册时展开一次。运行中改 profile，`run` 与 `send` 重启时会重读，但工具说明里的列表要重启 pi 才更新。

## session_shutdown

- 先停 inbox，再取走 service，然后写退出回执（仅当有子侧 inbox）。
- reason 命中 `closeChildrenOn` 走 `closeChildren()`：保留与关闭失败逐条通知；未命中只 `shutdown()`，不关 tab（DEC-0048）。
- 顺序固定：先停投递再关 tab，关闭过程中的死亡不会被当成新结果。

## auto-exit

- `agent_settled` 时读 `PI_SUBAGENT_AUTO_EXIT`，inbox 为空且没有未答对话框才 `ctx.shutdown()`（DEC-0056）。
- 由子进程决定：只有它能看到对话框与排队消息（DEC-0047）。

## inbox 投递

- 不转成工具结果：父模型看到的是一条用户消息，回复才有上下文；状态分支见契约 §5。
- 连续 3 拍失败停泵并通知：没有退避，继续跑只会刷通知。
