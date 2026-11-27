# 0073 起 agent 后轮询 `agent.get`，不靠 prompt 重试

`agent.start` 返回不代表能 prompt。herdr 0.9.5 的托管 agent 要把「启动中」推进到「可交互」，而这一步只有 `agent.get` 会触发。

## 为什么

真机上 `spawn` 必然在 30.4 秒后 `spawn_failed: agent_not_ready`。同样的服务端，CLI `herdr agent start` 3.1 秒就拿到 `interactive_ready: true` —— 差别在 CLI 每 100ms 发一次 `agent.get`（`src/cli/agent.rs:562`），而 `handle_agent_get` 是唯一会调 `reconcile_managed_agent_target` 的查询接口（`src/app/api/agents.rs:44`）。`agent.list` 与 `agent.prompt` 都不调。

子 pi 从启动到 idle 要 1.5–4 秒。第一次 reconcile 若在 `ready_after` 之前发生，herdr 会把 `ready_after` 置空，只在 `deadline` 到点时清掉名字；装了 pi 集成后屏幕检测被跳过，也不会再有周期性 reconcile 来救。实测细节见[研究记录 0009](../research/0009-agent-start-readiness.md)。

## 规则

- `HerdrClient.getAgent(target)` 读 `agent.get`：`{status, interactiveReady}`。
- `promptWhenReady` 先按 100ms 轮询到 `interactiveReady === true`，再 prompt。总预算 30 秒。
- 轮询期间 `agent_not_found` 与 `agent_not_ready` 都当「还在起」；其他错误立刻抛出。
- prompt 之后仍保留 `agent_not_ready` 重试：herdr 仍可能在被认成具名 agent 的瞬间回旧错误。
- e2e 用记录调用的 client 断言顺序 `startAgent` → `getAgent` → `prompt`。

## 代价

- 每个新 pane 多 1–30 次 `agent.get`（一请求一连接）。实测 3.0 秒就绪时约 30 次。
- 就绪判据绑在 herdr 的 `interactive_ready` 上：上游改语义时要跟着改。

## 否决的替代

- 只重试 `agent.prompt`：prompt 不推进启动状态，实测 30 秒内永远 `agent_not_ready`。
- 等 `deadline` 后 `agent.rename` 再 prompt：`deadline` 不由 `timeout_ms` 决定，实测 45–120 秒仍在 `agent_launch_pending`。
- 往 pane 里 `send_text` 输入 `pi …` 命令：能跑通，但要自己处理 PowerShell / bash 引号与 shell 就绪边界，还丢掉具名 agent。
- 子 pane 注入 `HERDR_ENV=0` 关掉集成：herdr 自注变量优先，无效。
- 用 CLI `herdr agent start` 兜底：等于把已删掉的子进程调用加回来。
