# 0002 · pi-herdr-subagents-lite v2 架构契约（封板稿）

本契约定义 `pi-herdr-subagents-lite` v2 的最终设计。v2 保留包名并全面复用 `herdr` 本地 Socket API 承担进程托管、事件推送、worktree 隔离、侧边栏展示与人工接管；扩展本体收口为无 UI 渲染、无自定义队列、无轮询的薄范式层，提供浅树约束、领域动态派生与单一前台提问收口。

## 1. 核心原则

- Shallow Tree: 固定为主从浅树结构，默认树深度上限为 1，子代理禁止继续派生。局部迭代留在单个子代理内部，不引入网状自由交接。
- Domain Context Isolation: 子代理按领域上下文边界动态切分，不设静态人设或职能角色。横向能力全部留在 Tools 与 Skills 中按需挂载，子代理只做上下文隔离单元。
- Split Only at Hard Ceilings: 机械式工具批处理交给 `codemode`，短任务与强耦合推理留在单会话。仅在对抗上下文腐化、并行降低延迟、最小权限隔离或模型分层路由时派生子代理。
- Non-Blocking Front Desk: 前台主代理是人类的唯一交互窗口，始终保持轻量与非阻塞。耗时、高噪音的自治任务全部异步下沉到后台子代理。
- Subtract Before You Add: 复用 `herdr` 原生 Socket API 与 `pi` 原生 `followUp` 排队；砍掉 `inbox`、`session-file`、`profile`、`turn`、超时定时器、每轮上下文快照注入与任何自定义 UI 渲染。

## 2. 身份区分与能力边界

主代理与子代理的身份绑定在进程生命周期上，不写死在 Session 文件里。

- 进程级身份信号
  - 根主代理启动时不带 `PI_SUBAGENT_DEPTH`，视为深度 0。
  - 父进程通过 `herdr` 原生环境透传（`--env` / Socket `env` 字段）在创建子 pane 时显式注入 `PI_SUBAGENT_DEPTH=1`、`PI_SUBAGENT_ID=<id>` 与 `PI_SUBAGENT_RUN_DIR=<runsDir>/<id>`，跨 Unix 与 Windows 无需拼接 Shell 命令。
  - 禁止通过猜 TTY、猜父进程名或猜运行模式推断主子身份。
- 按深度分流注册工具
  - `PI_SUBAGENT_DEPTH === 0`: 注册主代理控制面工具 `subagent`（`spawn`、`steer`、`inspect`、`stop`）。
  - `PI_SUBAGENT_DEPTH >= 1`: 不注册 `subagent`（物理禁嵌套），改注册极简提问工具 `request_input`，并在 `turn_end` 同步写出结果文件。
- 屏蔽子代理弹窗且零改动 `ask`
  - `pi-ask-question-lite` 不做任何修改。
  - `spawn` 通过 `pi` 的 `--tools` 启动参数默认剔除 `ask` 工具，从源头防止子代理在子 pane 内弹窗打断人类。
- 人工接管兼容
  - `failed` 与 `needs_input` 状态默认保留 `herdr` pane，人类可随时切过去直接接管。
  - 手动新开 `pi` 加载同一 `--session` 文件时，新进程不带 `PI_SUBAGENT_DEPTH`，自动恢复完整交互与 `ask` 能力。

## 3. 运行时架构与模块边界

沿用 Vertical Slice、Deep Module、Minimize Reader Load、单向依赖、每模块单一入口 `index.ts` 与单文件 150 行上限的仓库约束。

- 统一 `herdr` 本地 Socket API 传输层（重构 `src/herdr/`）
  - 通过环境变量 `HERDR_SOCKET_PATH` 连接本地 Socket（Unix 为 Unix Domain Socket，Windows 为 Named Pipe，Node.js `net.createConnection` 原生统一支持，逐行 JSON-RPC）。
  - 命令调用与事件订阅复用同一条传输抽象，消除所有 `execFile("herdr")` 子进程启动开销与定时轮询。
  - 命令能力: `tab.create`、`workspace.create`、`worktree.create`、`worktree.remove`、`agent.start`、`agent.prompt`、`agent.send_keys`、`pane.close`、`session.snapshot`。
  - 事件能力: 调用 `events.subscribe` 实时监听子代理状态迁移（`working`、`idle`、`done`、`blocked`）与 pane 关闭事件；断线重连时先重新订阅，再调用 `session.snapshot` 对账修复本地视图。
- Functional Core, Imperative Shell（重写 `src/run/`）
  - 判定逻辑做成零 IO 纯函数: 集中处理 `id` 格式与唯一性校验、状态合法转换、并发槽位检查与结果信封截断装配。
  - 流程编排保持直白可读: 单一内存状态表 `Map<string, RunRecord>` 由 `run` 模块独占修改，`spawn`、`steer`、`stop` 用直接的 `async/await` 调用注入的 `HerdrClient` seam，不引入多余的 Effect 解释器抽象。新人可在 30 秒内看清数据从哪来、谁能改它。
  - 不做跨会话状态持久化与认领: 父会话 `/reload` 或 `--resume` 后始终从空内存表起步，按 `closeChildrenOn` 清理旧子 pane，消除跨会话状态漂移。
- 子侧极简结构化落盘与零竞态时序
  - 不使用 `agent.read` 抓取终端滚动行，也不拦截工具轨迹猜测改动文件清单（真实改动由主代理按需用 `git status` 核验）。
  - 时序保证: `herdr` 的 Pi 集成（`herdr-agent-state.ts`）监听 `agent_end` 后上报 `idle`，而 `pi` 的 `turn_end` 严格先于 `agent_end` 同步触发。子侧扩展在 `turn_end` 与 `request_input` 时同步原子写入 `<runsDir>/<id>/result.json`（带单调递增 `seq`，原文超 `summaryMaxChars` 时按需落盘 `output.md` 附路径），父侧收到 Socket `idle` 事件时 `result.json` 必然已落盘完成，并以 `seq` 校验防止读到旧回合数据。
- 模块删留与单向依赖
  - 整块删除: `src/inbox/`、`src/session-file/`、`src/profile/`、`src/turn/`；单调用方薄包装直接内联。
  - 扩展本体零 UI 渲染（状态展示全交给 `herdr` 侧边栏），零每轮前置上下文注入（100% 保护主会话 KV Cache）。
  - 最终仅保留 5 个核心模块加组合根 `src/index.ts`: `src/config/`、`src/herdr/`、`src/run/`、`src/tool/`、`src/extension/`。

```text
index -> extension
index -> config
index -> herdr
extension -> tool
extension -> run
tool -> run
run -> herdr
run -> config
```

## 4. 模型面工具契约

- 主代理工具 `subagent`

```ts
export type SubagentParameters =
  | {
      action: "spawn";
      id: string;
      objective: string;
      context?: string;
      cwd?: string;
      worktree?: boolean;
      tools?: string[];
      skills?: string[];
      model?: string;
      thinking?: string;
    }
  | {
      action: "steer";
      id: string;
      message: string;
    }
  | {
      action: "inspect";
      id?: string;
    }
  | {
      action: "stop";
      id: string;
    };
```

- 子代理工具 `request_input`

```ts
export interface RequestInputParameters {
  questions: Array<{
    question: string;
    context?: string;
    options?: string[];
  }>;
}
```

- Separate Before Serializing 约束
  - 落盘隔离: 每个子代理独占目录 `<runsDir>/<id>/`（存放 `session.jsonl`、`result.json` 及超长时按需生成的 `output.md`），绝不多个子代理共写同一汇总文件。
  - 代码写隔离: 只读调研或确定不重叠的任务可共享 `cwd`；并发可写同一仓库时首选传 `worktree: true`，直接调用 `herdr` 的 `worktree.create` 创建独立 checkout 作为子代理 `cwd`，并在完工信封中返回路径由主代理决定合并或清理。
- 命名、Pane 策略与状态机
  - `id` 校验: 必须匹配 `^[a-z][a-z0-9_-]{0,31}$`，在当前父会话内唯一；重名直接返回 `duplicate_id`。
  - 状态集合: `starting`、`running`、`interrupting`、`needs_input`、`done`、`failed`、`cancelled`。
  - 槽位规则: 仅 `starting`、`running` 与 `interrupting` 占用 `maxConcurrent` 槽位。对 `needs_input`、`done` 或 `failed` 调用 `steer` 续跑时重新检查槽位，满则显式返回 `max_concurrent`，不做隐藏排队。
  - Pane 自动清理策略:
    - 正常 `done` 后默认自动调用 `pane.close` 关闭子 pane 保持侧边栏整洁，同时保留 `session.jsonl`；后续对该 `id` 调用 `steer` 时按原 `--session` 重开 pane 续跑。
    - `needs_input` 与 `failed` 保留 pane，方便人类一眼查看或直接切过去接管。
  - 运行中 `steer` 策略:
    - 避开 `herdr` `agent.prompt` 不追踪单回合的限制，对处于 `running` 的子代理调用 `steer` 时先进入 `interrupting`，通过 `agent.send_keys` 发送 `esc` 打断当前回合，等待 Socket 收到 `idle` 事件后再提交新的 `agent.prompt`。

## 5. 上下文保护与人机交接协议

- On-Demand Inspection
  - 不往主代理每轮上下文注入动态状态快照，彻底保护前缀 KV Cache。
  - 主代理被问及后台进度时，按需调用 `subagent(action="inspect")` 获取全局或单任务最新状态；人类侧直接看 `herdr` 侧边栏状态灯。
- Compact Return Envelope
  - 父侧读取 `result.json` 后装配精简信封推给主代理:
    - `id` 与 `status`: 来自运行记录与结果文件。
    - `summary`: 子代理最后一轮最终回复，超过 `summaryMaxChars` 时硬截断并附 `output.md` 路径。
    - `paths`: `session.jsonl` 路径与 `worktree` 路径（若有）。
    - `questions`: 来自 `request_input` 工具调用参数，100% 结构化。
- Unified Human Questioning
  - 子代理调用 `request_input` 时，工具将结构化问题同步写入 `result.json` 并返回确认文本提示结束本轮等待父代理答复，进入 `needs_input`。
  - 控制面经 `aggregateWindowMs` 合并多个子代理的待答问题推给主代理。
  - 主代理能凭全局语境拍板则直接 `steer` 回复；必须人类确认则合并成一次 `ask` 调用（题干前标 `[id]` 来源），由现有 `pi-ask-question-lite` 渲染表单并触发 `herdr:blocked`，人类一次答完后主代理分别 `steer` 分发续跑。
- Non-Intrusive Delivery
  - 结算结果经 `aggregateWindowMs` 合并后，直接通过 `pi` 原生 `sendMessage(..., { triggerTurn: true, deliverAs: "followUp" })` 投递给主代理。
  - 宿主原生保证主回合空闲时立即触发、进行中时排队到当前回合结束后再触发，扩展侧零自定义缓冲队列。

## 6. 失败模式与边界契约（Failure Modes）

- Socket 断线与重连对账: 本地 Socket 断开时自动退避重连；重连成功后先重新执行 `events.subscribe`，再拉取 `session.snapshot` 同步所有活跃 pane 真实状态，避免事件漏接导致状态卡死。
- `interrupting` 打断超时兜底: 运行中 `steer` 发送 `esc` 后若超过 `interruptGraceMs`（默认 3000ms）仍未进入 `idle`，兜底执行 `pane.close` 并以原 `--session` 重开新 pane 提交新 prompt，确保转向绝不永久卡死。
- 意外 `agent_blocked` 处理: 若子 pane 因外部原因进入 `herdr` `blocked` 状态，`agent.prompt` 返回 `agent_blocked` 时禁止盲发键盘输入，立即向上汇报异常等待人工介入。
- `worktree` 失败回滚: `worktree.create` 成功但随后的 `agent.start` 失败时，立即调用 `worktree.remove` 清理孤儿 worktree；任务中途 `stop` 或 `failed` 时保留 worktree 供排查或人工接管。
- 并发与幂等竞争: 按 `id` 串行化状态迁移；对已关闭或已取消的任务重复 `stop` 幂等返回成功；在 `interrupting` 期间收到多次 `steer`，仅保留最新一条消息在进入 `idle` 后投递。
- 会话收尾清理: 父进程触发 `session_shutdown` 且原因命中 `closeChildrenOn` 时，批量调用 `pane.close` 清理所有仍在运行的子 pane。
- 异常退出兜底: 子 pane 意外关闭且 `result.json` 无新 `seq` 时，父侧由 Socket 关闭事件直接收口为 `failed` 并释放槽位，不依赖超时定时器。

## 7. 配置与测试 Seam

- 配置契约（`<agent-dir>/pi-herdr-subagents-lite/config.json`）
  - `enabled`: 布尔值，默认 `true`。
  - `toolName`: 字符串，默认 `"subagent"`。
  - `maxConcurrent`: 整数，默认 `8`。
  - `summaryMaxChars`: 整数，默认 `2000`。
  - `aggregateWindowMs`: 整数，默认 `500`。
  - `interruptGraceMs`: 整数，默认 `3000`。
  - `closeChildrenOn`: 字符串数组，默认 `["quit", "reload"]`。
  - `runRetentionMs`: 整数，默认 30 天，会话启动时清理过期 `<runsDir>/<id>/` 目录。
- 测试 Seam
  - 纯函数判定（`run` 内部纯模块）: 零 mock 表驱动测试，覆盖 `id` 校验、状态合法迁移、并发槽位与超长信封截断。
  - `run` 流程编排: 注入 fake `HerdrClient` 与临时目录，覆盖 `spawn`、`steer`（含 `interrupting` 竞争与超时兜底）、`stop` 幂等、`done` 自动关 pane、`worktree` 回滚与意外关 pane 兜底。
  - `herdr`: 注入假本地 Socket 流（fake JSON-RPC 帧收发与断线模拟），覆盖全部 RPC 命令、`events.subscribe` 派发与重连后 `session.snapshot` 对账。
  - `extension`: 注入 fake `pi` 扩展 API，覆盖深度分流（主侧 `subagent` 与子侧 `request_input` + `turn_end` 同步写 `result.json`）、`--tools` 剔除 `ask` 与 `deliverAs: "followUp"` 投递。
  - 真机验收（`pnpm test:e2e`）: 在隔离 `herdr` session 中跑通 Socket 订阅、动态 `spawn`、`request_input` 汇总、`working` 态 `steer` 打断转向、`done` 自动关 pane 与 `worktree` 闭环。

## 8. 分阶段落地路径

每阶段均可独立通过 `pnpm check`。

- Phase 1 · `herdr` Socket Schema 对齐
  - 运行 `herdr api schema --json` 落盘到 `docs/research/`，核对 `tab.create` / `worktree.create` 的 `env` 字段、`events.subscribe` 帧格式与 `agent.send_keys(esc)` 的实际载荷。
- Phase 2 · Socket 客户端与 `run` 核心
  - 重写 `src/herdr/`（基于 `HERDR_SOCKET_PATH` 的统一 Socket 客户端 + 断线对账）与 `src/run/`（纯函数判定 + 直白 `async/await` 编排），跑通全部离线单测与 Failure Modes 回归。
- Phase 3 · 深度分流工具与扩展装配
  - 实现 `src/tool/`（主侧四动作 + 子侧 `request_input`）与 `src/extension/`（子侧 `turn_end` 同步写 `result.json` 与主侧 `deliverAs: "followUp"` 合并投递）。
- Phase 4 · 彻底减法清理与真机回归
  - 删除 `src/inbox/`、`src/session-file/`、`src/profile/`、`src/turn/` 及旧轮询配置，更新 `import-graph.mjs` 并跑通 `pnpm test:e2e`。
## 9. 落地修订（实现期事实核对）

本节记录实现时对照 herdr 0.9.5 与 pi 实测后对前文条款的修正。冲突时以本节为准，实测细节见 [研究记录 0007](../research/0007-herdr-socket-api.md)。

| 原文假设 | 实测 |
|---|---|
| `HERDR_SOCKET_PATH` 直接 `net.createConnection` | Windows 上它是命名管道名，必须补命名空间前缀；Unix 直接用路径 |
| `agent.start` 有 `env` 字段 | 没有。`env` 只在 `tab.create` / `pane.split` / `workspace.create` 上，且 herdr 自注变量优先于调用方 |
| herdr 状态含 `done`，可作完成信号 | `done` 是「idle 且没人看过」，pi 集成只报 `working` / `idle` / `blocked`。完成只能由 `result.json` 的 `seq` 判定 |
| 订阅 `events.subscribe` + 断线对账 | 订阅强制带 `pane_id`，任一条失效即整条连接被关。改用每 run 一个 `agent.wait` 长请求，见 [DEC-0071](../decisions/0071-completion-by-agent-wait.md) |
| `turn_end` 先于 herdr 上报 idle | 成立且更强：herdr 在 `agent_settled` 才上报，链路是 `turn_end` < `agent_end` < `agent_settled` |
| 环境注入在 `agent.start` | 改为：普通任务 `tab.create`（带 `cwd` / `label` / `env` / `focus: false`）；worktree 任务 `worktree.create` 后 `pane.split` 带 `env`，再关掉原根 pane |
| 一条连接复用到会话结束 | herdr 每回完一条请求就关连接，客户端一请求一连接 |
| `agent.wait` 只在状态变化时返回 | 当前状态已经匹配时立刻回 `agent_info`，客户端两种响应都读 |
| `agent.start` 返回即可 prompt | 还要等 herdr 把它认成具名 agent（实测 0.1–3.5 秒），期间 `agent.prompt` 回 `agent_not_ready`，按 250ms 重试 |
| `turn_end` 只在回合结束时写一次结果 | 提问后的续写回合也会写，会把 `needs_input` 盖成 `turn_end`；改由 `questions.json` 保状态，见 [DEC-0072](../decisions/0072-pending-questions-file.md) |

另：子进程参数按 pi 文档落成 `--exclude-tools ask`（`--tools` 纯名单会整体替换工具集，不能与 `+`/`-` 混用）。

## 9.1 真机 e2e

`pnpm -C packages/pi-herdr-subagents-lite test:e2e` 覆盖单测够不到的三条链路，每个用例各起一条隔离的命名 herdr session 与临时 `PI_CODING_AGENT_DIR`，缺 `herdr`、`pi` 或 `auth.json` 时整组跳过。不进 `pnpm check`。

| 用例 | 断言 |
|---|---|
| pane 中途被关 | `working` 时 `pane.close`，run 结算为 `failed`，summary 保留 `agent_not_running` 或 `agent_not_found` |
| 提问闭环 | 子侧 `request_input` 落盘后 envelope 为 `needs_input` 且带问题；`result.json` 与 `session.jsonl` 路径证明 env 透传；`pane.process_info` 的 argv 证明 `--exclude-tools ask` |
| 运行中转向 | `working` 时 `steer` 回 `interrupting`，esc 打断后新 prompt 投递并结算为 `done`，无问题上报 |

实测结论与错误码见[研究记录 0008](../research/0008-e2e-agent-wait-pane-close.md)。
