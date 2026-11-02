# CHANGELOG

本文件记录已发布版本的用户可见变更。更细的过程见 git log。破坏性变更标 **BREAKING**。0.5.2 及更早的变更见旧仓 `setwhite/pi-herdr-subagents-lite` 的 tag `v0.3.0`–`v0.5.2`。

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
