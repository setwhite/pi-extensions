# 0001 herdr 恢复与状态实测

研究记录；当前契约见 [v1 契约](../specs/0001-v1-contract.md)，决策见 [决策](../decisions/README.md)。

日期 2026-10-23。环境：herdr 0.9.5（Windows，protocol 22），pi 1.4.0。测试在隔离的 named session 里跑（`herdr --session u16test server` / `u16b`），未触碰 default session；测试后 `herdr session delete`。

## 结论

1. **server 重启后保留**：agent name（`tester`）、pane id（`w1:p1`）、`agent_session_path`、`pane label`（`pane rename` 设置）。**不保留**：`pane.report_metadata` 的 `title` 与 `tokens`（重启后 `pane list` 里消失）。`terminal_id` 会变。
2. **恢复命令是规范的 `pi --session <path>`**：启动时的额外 argv（`-e probe.ts`）在重启后丢失；`pane process-info` 的 `foreground_processes[0].argv` 只剩 `["pi","--session",path]`。依赖 `-e` 注入的子代理侧扩展在恢复后不存在。
3. **pi 的 herdr 集成走生命周期钩子，屏幕检测被跳过**：`agent explain --json` 返回 `screen_detection_skipped: true`、`screen_detection_skip_reason: "full_lifecycle_hook_authority"`。`ask_user_question` 弹窗显示在 pane 里时，`agent get` 仍是 `working`；全机只有 `~/.pi/agent/extensions/herdr-agent-state.ts:211` 在监听 `herdr:blocked`，没有第三方 emit 方；本项目的 bridge 是 emit 方（见测试 3）。
4. **恢复后被中断的轮不会自动重放**：session 里保留悬空 `toolCall`（没有 `toolResult`）；下一轮模型看到的是 “No result provided”，然后自行决定重试。测试里模型重试了 `sleep 120`。restart 不是副作用安全。

## 依据

### 测试 1：name / label / metadata 的恢复

```bash
herdr --session u16test workspace create --cwd <tmp> --label u16 --no-focus
herdr --session u16test agent start tester --kind pi --pane w1:p1 -- --session <tmp>\u16-session.jsonl
herdr --session u16test pane report-metadata w1:p1 --source subagents --title 'u16 task' \
  --token subagent=1 --token parent=01a1675c --token task=probe --ttl-ms 86400000
herdr --session u16test pane rename w1:p1 pane-label-u16
herdr --session u16test server stop
herdr --session u16test server   # 重启
```

重启后：

- `agent get tester` → `name: "tester"`、`pane_id: "w1:p1"`、`agent_session.value: <tmp>\u16-session.jsonl`。
- `pane list` → `label: "pane-label-u16"`；没有 `title`，没有 `tokens`。
- `terminal_id` 从 `term_65e7bd2380ee81` 变为 `term_65e7bd3bacffe1`。

### 测试 2：恢复命令

启动：

```bash
herdr --session u16b agent start tester --kind pi --pane w1:p1 -- \
  --session <tmp>\u16b-session.jsonl -e <tmp>\u16b-probe.ts
```

probe 在加载时写日志；重启 server 前删除日志，重启后日志仍为空。

`herdr --session u16b pane process-info --pane w1:p1`：

```json
{"foreground_processes":[{"argv":["C:\\Users\\Charles Liu\\.bun\\bin\\pi.exe","--session","C:\\...\\u16b-session.jsonl"]}]}
```

结论：`-e` 被丢弃。

### 测试 3：blocked 检测

在 pane 里让 pi 调 `ask_user_question`；弹窗渲染出来后：

```bash
herdr --session u16test agent get tester
# agent_status: "working"
herdr --session u16test agent explain tester --json
# screen_detection_skipped: true
# screen_detection_skip_reason: "full_lifecycle_hook_authority"
# state: "working", visible_blocker: false
```

`~/.pi/agent/extensions/herdr-agent-state.ts:211` 监听 `herdr:blocked`；`rg 'herdr:blocked' ~/.pi/agent/npm/node_modules ~/.pi/agent/extensions` 只命中这一处监听，没有 emit 方。

本项目的 `bridge` 实测：`ui_prompt_start/end` → `herdr:blocked` 后，ask 弹窗期间 `agent get` 为 `blocked`，`agent prompt` 返回 `agent_blocked`；Esc 后恢复 `idle`。见 [DEC-0040](../decisions/0040-bridge.md)。

### 测试 4：恢复后的悬空工具调用

在 `sleep 120` 的 codemode 调用进行中 `server stop`，重启后 session 文件最后一条是 assistant `toolCall`，没有对应 `toolResult`。发一条“继续”后，新 assistant 的 thinking 记录：

> The previous bash call returned "No result provided" — possibly the script was cancelled or timed out... I should re-run the command.

随后 `sleep 120` 再次执行。session 里没有写入 synthetic toolResult（仍是悬空 toolCall）。

## 未决

- herdr server 重启时 pending ask 对话框是否重绘：未实测；父侧不重放（DEC-0038），需要时人工处理。
