# 0023 先等 idle，再投 brief

先开 tab，等 agent 到 idle 再投 brief；brief 不进启动参数。

依据：带首轮任务的 child 立刻 working，启动等待会超时。

## 修订：改走 inbox，顺序不变

brief 仍是文件、仍不进启动参数；投递通道从 `agent prompt` 换成 inbox（DEC-0026 修订），但顺序仍是「先等 idle，再投」：`createInbox` → `agent start`（返回到 idle）→ `enqueue(@brief)`。

依据：`agent start` 的就绪条件就是 idle。先入队，子代理第一拍就开始干活，`agent start` 于是一直等到这轮结束；第一轮超过 `agent start --timeout 30000`（CLI 默认 20s，这里显式传 30s）就返回 `timeout`，run 记 `spawn_failed`，父侧拿不到 `running`（[实测](../research/0004-herdr-workspace-create.md)）。

代价：父侧不再观察子代理是否真取走 brief；扩展没装到子代理那边时，run 会停在 idle。
