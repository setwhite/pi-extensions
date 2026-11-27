# 术语 · pi-herdr-subagents-lite

一个概念一个词。出现同义词时，改成本表的词。

| 术语 | 指什么 | 不是什么 |
|---|---|---|
| **herdr** | 终端 workspace / tab / pane / agent 宿主，本包唯一的进程托管方 | 不是 pi 扩展 |
| **Socket** | herdr 的本地 NDJSON 接口，入口是 `HERDR_SOCKET_PATH` | 不是 CLI，也不是 HTTP |
| **run** | 一个子代理从 spawn 到结算的记录，`id` 在父会话内唯一 | 不是 herdr 的 agent 定义 |
| **id** | `^[a-z][a-z0-9_-]{0,31}$`，同时是 herdr agent name、tab label 与 run 目录名 | 不是 profile 名 |
| **子代理** | 深度 >= 1 的 pi 进程，禁止再派生 | 不是同进程的 conversation |
| **深度** | `PI_SUBAGENT_DEPTH`。0 是主代理，>= 1 是子代理，进程级身份 | 不是 TTY 猜测，也不是父进程名 |
| **run 目录** | `<agent-dir>/pi-herdr-subagents-lite/runs/<id>/`，放 `session.jsonl`、`result.json`，必要时 `output.md` | 不是父 session 文件所在目录 |
| **result.json** | 子侧唯一的完成信号：`{seq, state, text?, questions?, output?}`，`seq` 单调递增 | 不是终端输出，也不是 session 文件 |
| **questions.json** | 待答问题的标记文件，`request_input` 写、父侧回答前删；只要它在，`turn_end` 也写 `needs_input` | 不是第二个结果文件，父侧不读它 |
| **结算** | 父侧读完 `result.json` 后改状态、按需关 pane、合并投递 | 不是子进程退出 |
| **合并窗口** | `aggregateWindowMs` 内多个结算合成一条消息 | 不是自定义消息队列 |
| **投递** | 用宿主原生 `followUp` 把结算推回主代理 | 不是工具的同步返回值 |
| **槽位** | `maxConcurrent` 的一个名额，只有 `starting` / `running` / `interrupting` 占槽 | 不是 herdr 的 pane 数 |
| **run 状态** | `starting` / `running` / `interrupting` / `needs_input` / `done` / `failed` / `cancelled` | 不是 herdr 的 `agent_status` |
| **steer** | 给已有 run 追加消息。运行中先打断再投递 | 不是 spawn |
| **打断** | 向运行中的子代理发 `esc`，等它回到 idle | 不是关 pane |
| **打断兜底** | 超过 `interruptGraceMs` 还没 idle 时关 pane、按原 session 重开 | 不是重试 `esc` |
| **blocked** | 子 pane 里有审批或提问界面。只上报，不盲发按键 | 不是 `needs_input` |
| **needs_input** | 子代理通过 `request_input` 提了问题，pane 保留等人或主代理回答 | 不是 herdr 的 `blocked` |
| **inspect** | 主代理按需取运行状态，是唯一的进度查询面 | 不是每轮上下文注入 |
| **worktree** | `worktree.create` 出来的独立 checkout，作为并发可写任务的 cwd | 不是 branch，也不是 stash |
| **v1** | profile、inbox 文件协议、turn 事件、轮询存活检测 | 已被 v2 取代 |
