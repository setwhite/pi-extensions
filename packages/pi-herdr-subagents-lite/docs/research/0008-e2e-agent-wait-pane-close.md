# 真机 e2e 实测：pane 中途被关、提问闭环、运行中转向

目的：用隔离的命名 herdr session + 临时 `PI_CODING_AGENT_DIR` 跑真实子进程，把单测覆盖不到的三条链路压出实测结论。被测对象是真实的 `HerdrClient` 与 `createRunService`，不经过模型代理层。

复现：`pnpm -C packages/pi-herdr-subagents-lite test:e2e`（3 个用例，约 35 秒；缺 `herdr`、`pi` 或 `auth.json` 时整组跳过）。

## 1. pane 中途被关：`agent.wait` 回 `agent_not_running`

子代理在 `bash "sleep 30"` 里处于 `working` 时，直接 `pane.close` 掉它的 pane。多次运行出现两个错误码，取决于 close 落在 wait 在途还是下一条请求发出的瞬间：

```
run summary: pane or agent went away: agent_not_running: agent is no longer running in the target pane
run summary: pane or agent went away: agent_not_found: agent target w1:p2 not found
```

- 两种都是普通错误响应，不是断连：wait 在途时回 `agent_not_running`；pane 已经没了、下一条请求按 id 找不到目标时回 `agent_not_found`。
- 都不是 `pane_not_found`（后者只在显式 `pane.close` 一个不存在的 pane 时出现，见[研究记录 0006](0006-herdr-pane-close.md)）。
- 现有 `src/run/watch.ts` 的兜底与实测一致：wait 抛错即 `failed`，`errorText` 保留原始 code。**无需改代码**；e2e 断言按 `agent_not_(running|found)` 两个码锁住。

## 2. `agent.wait` 命中当前状态时回 `agent_info`

`until` 里的状态与服务端当前状态已经一致（例如 prompt 之后 agent 还停在 `idle`），服务端不推事件，直接回 `agent_info`：

```json
{"result":{"type":"agent_info","agent":{"pane_id":"w1:p2","agent_status":"idle"}}}
```

只有状态真的发生变化才回 `wait_matched` + `event.data.agent_status`。客户端两种都读，否则刚 prompt 完就会抛 `herdr_protocol`。

## 3. 刚 `agent.start` 的 pane 还不能 prompt

`agent.start` 立刻返回（`agent_status: "unknown"`），herdr 要等 pi 集成上报后才把它认成这个 pane 的具名 agent；在这之前 `agent.prompt` 直接失败：

```
agent_not_ready: agent w1:p2 is not an active named agent
```

实测窗口 0.1–3.5 秒，`agent.start` 的 `timeout_ms` 不管这段。

后来发现光重试 prompt 救不了：herdr 只在 `agent.get` 里推进托管 agent 的启动状态，真机上永远等不到。现在 `src/run/pane.ts` 的 `promptWhenReady` 先轮询 `agent.get` 到 `interactive_ready` 再 prompt，见[研究记录 0009](0009-agent-start-readiness.md) 与 [DEC-0073](../decisions/0073-agent-get-readiness-poll.md)。

## 4. `request_input` 会被下一回合的 `turn_end` 盖掉

子侧调用 `request_input` 写 `result.json`（`state: "needs_input"`，seq 1）。工具结果会触发继续回合，模型说完「Ending turn.」后 `turn_end` 又写一次，把 seq 2 覆盖成 `state: "turn_end"` —— 父侧于是把提问当普通完成结算，问题全丢。

修法：`request_input` 同时写 `<run 目录>/questions.json`；`turn_end` 落盘时若该文件存在，仍旧写 `needs_input` 并带上问题；父侧把答案 steer 回去前删掉它。实测 seq 2 / seq 3 都是 `needs_input`，回答后回到 `turn_end`。

## 5. 其他实测约束

- herdr 每回完一条请求就关连接，客户端必须一请求一连接（见[研究记录 0007](0007-herdr-socket-api.md)）。
- 命名 session 里没有 workspace 时 `tab.create` 回 `workspace_not_found` 并关连接，所以 e2e 先 `workspace.create`。
- 关 pane 后子 pi 的文件句柄有残留，Windows 上立即 `rmSync` 临时目录会 `EPERM`；teardown 重试 5 次（每次 500ms）。
