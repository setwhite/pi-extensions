# CHANGELOG

本文件记录已发布版本的用户可见变更。更细的过程见 git log。破坏性变更标 **BREAKING**。0.5.2 及更早的变更见旧仓 `setwhite/pi-herdr-subagents-lite` 的 tag `v0.3.0`–`v0.5.2`。

## 0.6.0 — 2026-11-01

- **BREAKING**：源码并入 [setwhite/pi-extensions](https://github.com/setwhite/pi-extensions)，只从 npm 安装。pi 的 git 安装只认仓库根，指不到子目录。`git:` 安装留在旧仓，不再更新。
- 开发：CI、发布、提交前闸、lockfile 与行尾策略收成仓库一份。提交前闸改跑全部三个包。
