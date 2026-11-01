# 0056 auto-exit 用 pane env 传

父侧显式传 `--env PI_SUBAGENT_AUTO_EXIT=1|0`（同 cwd 走 `tab create`，不同 cwd 走 `workspace create`），每个 run 都传，不靠继承。子侧读到 1 时，在 `agent_settled` 检查 inbox 为空且没有未答对话框，满足才 `ctx.shutdown()`。

取消项：写 `<childSession>.auto-exit` marker 文件（多一个文件协议，且与 DEC-0046 的角色判定混在一起）；`-e` 注入子侧代码（DEC-0031 实测 server 重启丢）。

依据：herdr 0.9.5 的 `tab create` 与 `workspace create` 都支持 `--env`；`pi --help` 没有 auto-exit 类参数，扩展侧只有 `ctx.shutdown()`。
