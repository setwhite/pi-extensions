# 0009 真机验收不带 `-ne`

## 决定

- 验收"面板变红"时用 `pi -e ./packages/pi-ask-question-lite/src/index.ts`，让扩展发现照常跑；`-ne` 只用于隔离其它扩展看渲染。
- AC8 的命令同步去掉 `-ne`。

## 为什么

`herdr:blocked` 只是 `pi.events` 上的事件，消费方是 herdr 装在 `~/.pi/agent/extensions/herdr-agent-state.ts` 的集成，而它靠扩展发现加载。`-ne` 关掉扩展发现后这份文件不加载，事件没人听，面板永远不会变红——之前 AC8 里的 `-ne` 命令验不出这条。

实测（2026-11-25，herdr 0.9.5，隔离 tab `w31:tB` / pane `w31:pC`）：

- 启动：`herdr agent start askprobe --kind pi --pane w31:pC -- -e packages/pi-ask-question-lite/src/index.ts`，扩展列表里同时有 `herdr-agent-state.ts` 与 pi-ask-question-lite。
- 弹窗期间 `herdr agent get askprobe` 的 `agent_status` 是 `blocked`（`state_change_seq` 从 67 到 69）。
- 按 `1` 选第一项：`blocked` → `working` → `done`，聊天里出 `✓ Choose: A`，模型回一句后停。
- 再来一轮按 `esc`：`blocked` → `done`，聊天里是 `✗ aborted`，没有第二次模型回复。

## 代价

- 真机验收会带上用户装的所有扩展，其它扩展的干扰也算进来；所以每次用隔离的 tab / pane 跑，跑完关掉。
- 验收环境依赖 herdr 注入的 `HERDR_ENV` / `HERDR_SOCKET_PATH` / `HERDR_PANE_ID`，在 herdr 外面复现不了这条。
