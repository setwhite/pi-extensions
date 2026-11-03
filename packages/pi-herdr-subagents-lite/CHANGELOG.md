# CHANGELOG

本文件记录已发布版本的用户可见变更。更细的过程见 git log。破坏性变更标 **BREAKING**。0.5.2 及更早的变更见旧仓 `setwhite/pi-herdr-subagents-lite` 的 tag `v0.3.0`–`v0.5.2`。

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
