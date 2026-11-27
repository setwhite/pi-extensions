# CHANGELOG

本文件记录已发布版本的用户可见变更。更细的过程见 git log。破坏性变更标 **BREAKING**。0.5.2 及更早的变更见旧仓 `setwhite/pi-herdr-subagents-lite` 的 tag `v0.3.0`–`v0.5.2`。

## 0.12.0 — 2026-11-27

按 [v2 契约](docs/specs/0002_v2_architecture_spec.md) 重写，模块只剩 `config` / `herdr` / `run` / `tool` / `extension`。

- **BREAKING**：工具动作改为 `spawn` / `steer` / `inspect` / `stop`，参数是 `id` 而非 `name` / `profile`。老写法 `run` / `send` 不再存在。
- **BREAKING**：删掉 profile 模块。不再有 `profiles/*.md`、全局与项目两层查找、`auto-exit`、`system-prompt`、示例落盘。子代理的身份改由 `spawn` 参数与 `PI_SUBAGENT_*` 决定。
- **BREAKING**：删掉 `herdrBin`、`maxResultChars`、`closeOnFailure`、`inboxPollMs`、`livenessPollMs`、`prompts` 六个配置键，出现即加载失败。新增 `summaryMaxChars`（默认 2000）、`interruptGraceMs`（默认 3000）。
- **BREAKING**：`maxConcurrent` 默认值从 16 改为 8，上限 64。
- herdr 改走本地 Socket 的 NDJSON 接口，不再起 `herdr` CLI 子进程，也没有任何轮询。
- 完成通知改成每条 run 一个 `agent.wait` 长请求，不用 `events.subscribe`（DEC-0071）。完成判定只认 `result.json` 的 `seq` 递增。
- 新增 `worktree: true`：给可并发的写任务单独 checkout，失败自动回滚 worktree。
- 子代理不注册 `ask`：提问用 `request_input` 写进 `result.json`，不在子 pane 弹对话框。待答问题另存 `questions.json`，提问后的续写回合不会把它盖成完成（DEC-0072）。
- 新增真机 e2e：`pnpm test:e2e` 自起隔离 herdr session，覆盖 pane 中途被关、提问闭环、运行中转向三条链路，不进 `pnpm check`。
- 修：真机上 `spawn` 必然 30 秒超时 `spawn_failed: agent_not_ready`。herdr 0.9.5 只在 `agent.get` 里推进托管 agent 的启动状态（`agent.list` 与 `agent.prompt` 都不推进），现在先轮询到 `interactive_ready` 再 prompt（DEC-0073）。e2e 的临时 agent dir 也装上 herdr 的 pi 集成，跑的和真机同一条上报路径。

## 0.11.2 — 2026-11-25

- 无运行时变更：README 封面图挪到标题下面，语言切换挪到封面之后。
- 语言切换不再用加粗表示当前页：当前语言写成纯文本排第一，另一个才是链接，如 `English | [简体中文](README.zh-CN.md)`。

## 0.11.1 — 2026-11-25

- 无运行时变更：README 加封面图，截的是 `subagent` 的 `run` 在独立 herdr 标签页起 worker-2、立即返回 `{state: running}` 那一下。
- 封面链接用 `raw.githubusercontent.com` 绝对地址：`assets/` 不在 `files` 里，相对路径在 npm 页面上是死链。

## 0.11.0 — 2026-11-24

- **BREAKING**：删掉 bridge。本包不再监听 `ui_prompt_*`，不再 emit `herdr:blocked`，`bridge` 配置键变成未知键（老配置加载失败）。要上报 blocked，装会开模态对话框并自己 emit `herdr:blocked` 的扩展（DEC-0070）。
- 修：`pi-todo-lite` 的装饰 overlay 走 `ctx.ui.custom`，pi 对非捕获 overlay 也发 `ui_prompt_start`，bridge 把它翻成 `herdr:blocked`，pane 从 pi 启动起一直红，`herdr agent start` 还以 `agent_not_ready` 拒绝它。

## 0.10.0 — 2026-11-21

- **BREAKING**：profile 里出现不认识的字段不再忽略。该 profile 不加载，`run` 返回 `profile_invalid` 并指出字段（DEC-0069）。拼错 `auto_exit` 这类键以前是静默失效。
- **BREAKING**：新增配置 `runRetentionMs`（默认 30 天，`0` = 永不清理）。`runs/` 下的 brief、identity、inbox、回合事件、artifact 按修改时间在会话启动时清理（DEC-0068）。过期后结果消息里的 `Full result:` 路径失效。
- 修：子代理还在启动（pane 或 agent 没就绪）时，存活对账会提前判它失去联系，父模型收到一条假的 `lost contact; no result`。run 新增 `starting` 状态（DEC-0066）。
- 修：回合已收尾的子代理随后退出，会再给父模型补一条「stopped before reporting a result」。现在只静默关 pane。
- 修：用户中止工具调用时，启动流程照旧跑完并建出 pane，父侧却记为中止。abort 信号现在贯穿到 herdr 调用（DEC-0067）。
- 修：herdr CLI 卡住会吃掉整轮工具调用。查询 20 秒、变更 120 秒上限，变更超时报 `herdr_timeout` 并提示可能已生效。
- 修：并行两条 `send` 打同一个待重启的 run 会在同一个 pane 上起两次 agent。第二条现在报 `spawn_failed`。
- 修：会话关闭时聚合器还会把排队结果投给已经结束的会话。
- 修：`listAgents` 慢于轮询间隔时存活对账会叠加，把缺席多记一遍，三拍就误判。
- `turn` 模块拆成 `classify.ts`（纯判定）与 `store.ts`（读写），`send` 拆出 `resume.ts`，启动的换名重试拆出 `retry.ts`。

## 0.9.0 — 2026-11-12

- **BREAKING**：完成不再从 session 尾部推断。子代理在每个 `agent_settled` 写一个回合事件（`<runBase>.turns/<n>.json`），父代理只认这个文件。失败轮、中断轮不会再被当成完成；消息明确写 `failed` / `interrupted`，并附已有部分文本。
- **BREAKING**：子代理不再自杀。`auto-exit` 变成父代理的关闭判据：`done` 且没有活着的子代理才关。删掉 `PI_SUBAGENT_AUTO_EXIT`。
- **BREAKING**：配置项 `pollIntervalMs` 与 `idlePollIntervalMs` 删除，改为 `livenessPollMs`（默认 15000）。`closeChildrenOn` 默认改为 `["quit", "reload"]`，新增 `closeOnFailure`（默认 false）。
- 不再每秒起 `herdr agent list` 进程。回合用 500ms 一次本地目录扫描；存活只对进行中的 run 每 15 秒对账，连续三次缺席才判失去联系。
- 并发上限只数进行中的回合。收工等 `send` 的子代理不再占槽。
- 关 pane 重试 3 次、间隔 250ms；失败只通知一次。

## 0.8.0 — 2026-11-03

- 模型不再看到子 session 路径与 pane id：`run` 与 `send` 的工具返回只剩 `state` 与 `name`，`paneId` 与 `sessionFile` 留在 `details`。`unknown` 结果消息不再附 `Session file:`。`send` 的错误只报子代理名。目的是不让父代理顺着路径去读子会话正文。
- **BREAKING**：文件位置改了。子 session 落在父会话桶的 `runs/` 子目录，brief、identity、inbox、exit 回执、结果 artifact 落在 `<agent-dir>/pi-herdr-subagents-lite/runs/` 一层平铺，共用 `<name>-<runId>` 前缀。超长结果的 `Full result:` 指向新位置。路径只影响新 run。
- 修：子代理收工、会话关掉后 tab 留在原地。关闭改用 `pane close`，不再先核对 tab 里只有一个 pane —— 那个核对撞上 herdr 重登记 pane 的窗口就会静默放弃。同 tab 里人开的 pane 不受影响。
- 关 pane 失败不再是终态：补一条 `close_failed`，子代理死亡时再关一次。
- 修：新回合写出和上一轮逐字相同的答案时，结果被当成重复丢掉，也不关 tab。判据改成「session 文件尾部换过没有」。

## 0.7.2 — 2026-11-03

- 内置工具文案改为讲用法：`description` 说何时用 `run`、何时用 `send`。
- 删掉 guideline 里 "The parent handles user interaction, cross-task synthesis, and decisions; subagents execute." 一行。剩下三条讲 `run` 与 `send` 的语义，最后一条列 profile。

## 0.7.1 — 2026-11-03

- 发布：`CHANGELOG.md` 进 `files`。此前 tarball 里没有它，pi 更新扩展后看不到变更。本版起补上。首次更新到本版时，"Extension Updates" 下只有这一条。

## 0.7.0 — 2026-11-02

- **BREAKING**：`profiles/examples/` 每次加载都镜像到包内示例。自带文件重写，多余文件与子目录删除。这个目录是分发物。自己的 profile 放在 `profiles/`，不放 `examples/`。
- 自带示例改名为 `worker`：`description` 是 `General purpose.`，body 两条——需要设计决策时停下并报告、简洁报告改了什么/还剩什么/卡在哪。
- 示例把 `skills` 注释掉，默认继承技能。原来写 `skills: []`，子代理拿不到任何技能。
- 示例的 `auto-exit` 改为 `true`：收工后子进程 shutdown、父侧关 tab，槽位不再被占。再 `send` 时重启一个 pane，续同一个 session。

## 0.6.0 — 2026-11-01

- **BREAKING**：源码并入 [setwhite/pi-extensions](https://github.com/setwhite/pi-extensions)，只从 npm 安装。pi 的 git 安装只认仓库根，指不到子目录。`git:` 安装留在旧仓，不再更新。
- 开发：CI、发布、提交前闸、lockfile 与行尾策略收成仓库一份。提交前闸改跑全部三个包。
