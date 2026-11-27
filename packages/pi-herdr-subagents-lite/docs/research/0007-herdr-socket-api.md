# 0007 · herdr 0.9.5 Socket API 实测核对

对照 `docs/specs/0002_v2_architecture_spec.md` 的 Phase 1 清单，用 `herdr api schema --json`（protocol 22）、真实本地 Socket 探测与 `~/.pi/agent/extensions/herdr-agent-state.ts`（herdr 官方 pi 集成）核对。

## 结论速查

| 契约假设 | 实测 | 影响 |
| --- | --- | --- |
| `HERDR_SOCKET_PATH` 可直接 `net.createConnection` | Unix 是 UDS 路径；Windows 必须拼成 `\\.\\pipe\\<HERDR_SOCKET_PATH>`。该文件本身是 `<server_pid>:<nonce>` 文本，不是管道名 | 传输层按平台拼 endpoint，仍是一条代码路径 |
| `agent.start` 支持 `env` | 无 `env` 字段 | 环境变量改由 `tab.create` / `pane.split` / `workspace.create` 注入 |
| `worktree.create` 支持 `env` | 无 | worktree 场景先 `worktree.create` 拿 path，再在该 workspace 里 `pane.split(env)` |
| `done` 作为完成信号 | `AgentStatus` 有 `done`，语义是 idle 且未被查看；pi 集成只上报 `working`/`idle`/`blocked` | 完成判定只看 `result.json` 的 `seq`，`done` 不作为契约 |
| `turn_end` 早于 herdr 上报 idle | 成立且更强：集成在 `agent_settled` 上报，而 `turn_end` < `agent_end` < `agent_settled` | 子侧 `turn_end` 原子写 `result.json` 的时序安全 |

## 传输

- 帧格式：每行一个 JSON。请求 `{"id","method","params"}`，成功 `{"id","result":{"type":...}}`，失败 `{"id","error":{"code","message"}}`。
- 方法名是点号命名（`tab.create`、`agent.wait`），但订阅类型和事件名用下划线/点号两套：订阅填 `pane.closed`，事件帧的 `event` 是 `pane_closed`。
- 事件订阅需要常驻连接；本设计已改为 `agent.wait` 长请求，不建常驻订阅。

## 命令面

- `tab.create`: `{cwd,label,env,focus,workspace_id}` → `tab_created{tab,root_pane}`。
- `pane.split`: `{target_pane_id,direction,cwd,env,focus,ratio}` → `pane_info{pane}`。
- `worktree.create`: `{cwd,path,branch,label,workspace_id,focus}`，无 `env` → `worktree_created{workspace,tab,root_pane,worktree.path}`。
- `worktree.remove`: `{workspace_id,force}`。
- `agent.start`: `{name,kind,pane_id,args,timeout_ms}`（无 env，无 cwd），→ `agent_started{agent,argv}`。
- `agent.prompt`: `{target,text,wait?}` → `agent_prompted`；目标是 `blocked` 时返回错误码 `agent_blocked`，且不发送输入。
- `agent.send_keys`: `{target,keys:["esc"]}`。
- `agent.wait`: `{target,until,timeout_ms}` → `wait_matched{event:{event,data}}`，`data.agent_status` 是命中状态；服务端事件驱动，不轮询。
- `pane.close`: `{pane_id}` → `ok`；pane 不存在时报错（本设计吞 `pane_not_found` 保证幂等）。
- `session.snapshot` / `agent.list` / `pane.list` 用于需要时的权威对账。

## 订阅面的坑（不进本设计，留档）

- `pane.agent_status_changed` 订阅必须带 `pane_id`，缺字段回 `invalid_request`。
- 订阅里任何一个 pane 已不存在，服务端会拒绝整个请求**并关闭连接**。子 pane 生命周期与连接生命周期耦合，这正是改用 `agent.wait` 的原因。
