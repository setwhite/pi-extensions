# 0063 关 pane 只由父代理做

删除子代理自杀。`auto-exit` 从「子代理自己 `ctx.shutdown()`」变成「父代理收到 `done` 后关 pane」。`PI_SUBAGENT_AUTO_EXIT` 环境变量与 `auto-exit.ts` 一并删除。

## 关闭判据

| 回合结果 | 子代理还活着 | 关 pane |
|---|---|---|
| `done` 且 `autoExit` | 是 | 关 |
| `done` 且非 `autoExit` | 是 | 不关，等 `send` |
| `error` 或 `aborted` | 是 | 默认不关，可 `send` 续 |
| `quit` | 否 | 关 |
| 无事件，agent 连续缺席三次 | 否 | 关 |
| 父会话按 `closeChildrenOn` 退出 | 是 | 关 |

`children > 0` 时推迟关闭。子代理还有自己的子代理在跑，关掉会留孤儿。

关 pane 不删 run 记录。记录里有 `sessionFile`，`send` 还要用它重启。

## 为什么换

关的人必须比被关的活得久。子代理关自己的 pane，关闭命令可能随进程一起消失，失败也无法重试。

旧实现有两个主人：子代理在 `agent_settled` 自杀，父代理在 `finish` 里关 pane。收件箱检查与 `ctx.shutdown()` 之间有 TOCTOU：父代理这一刻塞进来的消息落进死会话，静默丢失。

## 代价与边界

- 父代理关 pane 是杀进程，不是优雅退出。`agent_settled` 之后 session 已落盘、回合事件已写完，可接受。
- 关失败重试 3 次、间隔 250ms。仍失败就记下来、通知一次，不再循环。
- 父会话不在时没人关。`closeChildrenOn` 默认 `["quit", "reload"]` 兜住。

## 否决的替代

- 保留自杀，加退出锁与二次查收件箱。四道闸门解决一个本可以不存在的问题。
- 让启动脚本关 pane（modem-dev 的做法）。我们的子进程是直接 `pi --session` 起的，没有 wrapper。
- 子代理调 `herdr pane close` 关自己。命令可能先杀掉自己。
