# 实测：socket 起的托管 agent 卡在启动中，只能靠轮询 `agent.get` 推进

目的：解释真机上 `spawn` 30.4 秒后必然 `spawn_failed: agent_not_ready`，并找出不靠 CLI、不靠往 shell 里打字进命令的修法。

环境：herdr 0.9.5（protocol 22）、pi 1.6.1、`~/.pi/agent/extensions/herdr-agent-state.ts`（herdr 的 pi 集成，代码里 `HERDR_INTEGRATION_ID=pi`）。

## 现象

```
spawn_failed: agent_not_ready: agent w3:p6 is not an active named agent. Pane: w3:p6
```

socket `agent.start` 10ms 就返回，`agent_status: "unknown"`、没有 `interactive_ready`；之后每次 `agent.prompt` 都回 `agent_not_ready`，直到 `promptWhenReady` 的 30 秒预算用光。pane 里 pi 的 TUI 完全正常，`agent.list` 也能看到这个 pane 的 agent。

## CLI 为什么行

`herdr agent start <name> --kind pi --pane <pane>` 3.1 秒返回 `interactive_ready: true`。服务端日志里 `cli:agent:start` 请求本身 6ms 就完成了，所以差异不在请求参数，而在客户端：

- `src/cli/agent.rs:562 wait_for_named_agent` 每 100ms 发一次 `agent.get`，直到 `interactive_ready == true`。
- `src/app/api/agents.rs:44 handle_agent_get` 第一行就是 `self.reconcile_managed_agent_target(&target.target)`。
- `handle_agent_list` 不做 reconcile。

`src/terminal/state.rs:2206 reconcile_managed_agent_at` 的规则：

- `agent.start` 建 `ManagedAgentPhase::Pending { ready_after: now + settle_delay, deadline: now + timeout }`。
- 转 `Active`（外层 `interactive_ready` 的来源）只在 `known_agent == kind && state == Idle && now >= ready_after` 同时成立时发生。
- 第一次 reconcile 早于 `ready_after`（子 pi 还没到 idle）时，`ready_after` 被置成 `None`，之后只在 `now >= deadline` 时 `clear_agent_name()`。
- `managed_agent_launch_pending()` 为真期间，`agent.prompt` / `agent.rename` 直接回 `agent_not_ready` / `agent_launch_pending`。

子 pi 从启动到 idle 要 1.5–4 秒（11 个用户扩展、`defaultThinkingLevel: max`、启动时 npm 版本检查），第一次 reconcile 落在窗口内就锁死。装了 pi 集成后 `screen_detection_skipped: true`（`full_lifecycle_hook_authority`），屏幕检测不再周期性推状态，也没有第二次 reconcile 来救。

## 实测对照

| 做法 | 结果 |
|---|---|
| socket `agent.start` + 直接 prompt | 卡住，30 秒超时 |
| socket `agent.start` + 每 100ms `agent.get` | **3044ms** 拿到 `interactive_ready: true`，prompt / `agent.wait` / session 落盘全部正常 |
| socket `agent.start` + 每 500ms `agent.list` | 卡住（`agent.list` 不 reconcile，这就是之前诊断被误导的原因） |
| tab env 加 `HERDR_ENV=0` 想关掉子 pi 的集成 | 无效：herdr 自注变量优先，子代理照旧上报，`agent_session.source` 仍是 `herdr:pi` |
| 隔离命名 session + 真实 agent dir | 复现 |
| 同一隔离 session、临时 agent dir（没有集成） | 不复现 —— 所以之前的 e2e 全绿也没抓到它 |
| 往 pane 里输入 `pi --session "…" --exclude-tools ask` | 可用（3.8 秒被识别成 pi/idle），但要处理 PowerShell / bash 引号与 shell 就绪边界，否决 |

## 修法

- `src/herdr/index.ts` 新增 `getAgent(target)`，读 `agent.get` 的 `agent_status` 与 `interactive_ready`。
- `src/run/pane.ts` 的 `promptWhenReady` 先按 100ms 轮询 `agent.get` 直到 `interactive_ready === true`（30 秒预算，`agent_not_found` / `agent_not_ready` 都算「还在起」），然后再 prompt；prompt 的 `agent_not_ready` 重试保留作兜底。
- 决策见 [DEC-0073](../decisions/0073-agent-get-readiness-poll.md)。

## e2e 覆盖

e2e 的临时 agent dir 现在装一份迷你集成（`test/e2e/fixtures/herdr-agent-state.ts`），行为和真机的 `herdr-agent-state.ts` 一致：`session_start` 报 session 与 idle、`agent_start` 报 working、`agent_settled` 报 idle。

它保证 e2e 跑的是「装了集成」这条路径，但**不能**稳定复现卡死：e2e 的子 pi 只装本包、thinking 关掉，1–2 秒就到 idle，恰好抢在第一次 reconcile 前面激活。真机上慢的是模型与扩展加载。所以这条链路的回归保护靠两处：单测锁调用顺序（`agent.get` 轮询先于 prompt），e2e 用记录调用的 client 锁真机顺序（`startAgent` → `getAgent` → `prompt`）。

## 给上游的最小复现（herdr 0.9.5）

1. 一个装了 pi 集成的 agent 目录（`~/.pi/agent` 即可），起隔离 session：`herdr --session repro server`。
2. 取 socket：`herdr --session repro status server --json` 里的 `socket`，按 `\\.\pipe\\<socket>` 连接。
3. 依次发 `workspace.create`（`{cwd, label, focus: true}`）、`tab.create`（`{workspace_id, cwd, label, env: {PI_SUBAGENT_DEPTH: "1"}}`）、`agent.start`（`{name, kind: "pi", pane_id, args: ["--session", "<run dir>/session.jsonl", "--exclude-tools", "ask"], timeout_ms: 60000}`）。
4. 之后**只发** `agent.prompt`（目标用 pane id）和 `agent.list`。

期望：`interactive_ready` 变 true，`agent.prompt` 成功。
实际：`interactive_ready` 一直缺省，`agent.prompt` 一直回 `agent_not_ready: agent <pane> is not an active named agent`；中间每 100ms 插一条 `agent.get`（`{target: pane_id}`）就立刻正常。

根因线索：`reconcile_managed_agent_at` 在 `ready_after` 已过但 `state != Idle` 时把 `ready_after` 置 `None`，之后只有 `agent.get` 或进程事件会再次触发它；`deadline` 到点先 `clear_agent_name()` 再判断激活，所以错过窗口就再也激活不了。
