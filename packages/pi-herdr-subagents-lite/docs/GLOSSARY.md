# 术语 · pi-herdr-subagents-lite

| 术语 | 指什么 | 不是什么 |
|---|---|---|
| **herdr** | 终端 workspace / tab / pane / agent 宿主 | 不是 pi 扩展 |
| **workspace** | herdr 的顶层容器，装 tab。run 的 cwd 与父 cwd 不同时新建，label = 子代理名 | 不是 tab，也不是 pane |
| **pi-herdr-subagents** | 同名参考项目，有 fyang93 与 modem-dev 两个版本 | 不是 herdr 的一部分，也不是本项目的 fork 来源 |
| **pi-durable** | 可嵌入的 durable harness。子代理是同进程子 conversation | 没接进 pi CLI |
| **常驻子进程** | `pi --session <file>`。可续聊、反问、steer | 不是一次性 `-p --no-session` |
| **任务简报** | `<runBase>.brief.md`。内容是 `# Task` 段加任务正文。`system-prompt: task` 时 profile body 在前（DEC-0009） | 不是 profile body，也不是 session 文件 |
| **身份文件** | `<runBase>.identity.md`。存 profile body。`system-prompt: task` 时不写（DEC-0051） | 不是任务简报，也不是 session 文件 |
| **槽位** | `maxConcurrent` 的一个名额。占槽 = run 处于 `running`（回合在飞） | 不是 herdr 的 pane 数 |
| **run 状态** | `running` / `idle` / `dead` / `closed`（DEC-0065）。只有 `running` 占槽 | 不是 herdr 的 `agent_status` |
| **profile** | 角色模板。全局与项目各一层 `profiles/*.md`。frontmatter `name` 是唯一键（必填）。同名时项目覆盖。同一层同名全无效（路径见契约 §2） | 不是 agent name |
| **子代理名** | `<profile>-<n>`，herdr live agent name。run 返回，send 用它 | 不是 profile 名，也不是 pane 标题 |
| **tab label** | tab 栏文字。v1 等于子代理名 | 不是 agent name 字段 |
| **pane label** | pane 头文字。v1 是任务第一行，为空时用子代理名 | 不是 tab label |
| **回合事件** | `<runBase>.turns/<n>.json`。子代理在每个 `agent_settled` 写，父代理消费后删除（DEC-0062） | 不是 session 文件，也不是退出回执 |
| **blocked** | agent 正在等人处理输入。v1 由 bridge 监听 `ui_prompt_*` 上报 | 不靠屏幕检测 |
| **bridge** | 同一扩展内的监听器。`ui_prompt_start/end` → `herdr:blocked`（v1） | 不是 herdr 自带集成，也不是第二个入口 |
| **结果 artifact** | 超限结果的全文文件，`<runBase>.result-<seq>.md` | 不是子 session 文件，也不是每次结果都写 |
| **子侧 inbox** | `<runBase>.inbox/`。父侧写（brief 与 send 消息），子进程读（DEC-0023、DEC-0026） | 不是 herdr 的消息队列，也不是结果通道 |
| **subagent_result** | 回投父会话的异步结果消息 | 不是工具的同步返回值 |
| **auto-exit** | profile 字段。true = 父代理在 `done` 回合后关 pane。子代理不再自杀（DEC-0063） | 不是全局配置 |
| **存活对账** | 每 15 秒一次 `agent list`，只看 `running` 的 run。连续三次缺席判 `dead`（DEC-0064） | 不是结果来源，也不读 pane 文本 |
| **run** | 一个子代理从启动到退出的记录。`run` 返回后，`name`、`sessionFile` 与 `<runBase>` 在其生命周期内不变 | 不是 profile，也不是 herdr 的 agent 定义 |
| **run 基名** | `<runBase>` = `<agent-dir>/pi-herdr-subagents-lite/runs/<name>-<runId>`。没有扩展名。brief、identity、inbox、回合事件、结果 artifact 都挂在它上面 | 不是 session 文件，也不是目录 |

| **v1** | profile（含 auto-exit）、send 含续聊、bridge、回合事件、反问留在子 pane、npm 发布 | 不含 fork，死亡不自动重启 |
