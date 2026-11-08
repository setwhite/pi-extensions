# CHANGELOG

本文件记录已发布版本的用户可见变更。更细的过程见 git log。破坏性变更标 **BREAKING**。

## 0.1.0 — 2026-11-08

首版。

- 五个工具：`chrome_act`（navigate、click、type、fill、press、hover、drag、scroll、upload、eval、wait、batch）、`chrome_see`（refs、text、changes、full，另可取 console 与 network 日志）、`chrome_tab`（list、new、switch、close、group）、`chrome_vision`（截图落盘）、`chrome_cdp`（裸 CDP 调用）。
- `/chrome` 命令：`authorize on|off`、`background on|off`、`status`。扩展装好之前，命令与工具都报 `extension_missing` 并给出装扩展三步。
- 本地桥：只绑 `127.0.0.1`，多 Pi 会话共用一个服务端，其余退成客户端。扩展每 100 毫秒轮询一次。
- 每个会话一份自动化 target：动作在本次会话自己建的标签里执行，退出时按配置关掉。
- 发布：`CHANGELOG.md` 与 `browser-extension/` 一起进 `files`。用户从 npm 装到扩展源码后 load unpacked。
