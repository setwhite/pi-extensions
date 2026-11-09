# CHANGELOG

本文件记录已发布版本的用户可见变更。更细的过程见 git log。破坏性变更标 **BREAKING**。

## 0.3.1 — 2026-11-09

- `/chrome authorize on` 第一次就成功：不再要求扩展此刻已连上再授权。扩展按轮询连上来，此前命令在起桥后立刻查连接台账，那一刻还没连上，所以第一次必然报 `extension_missing` 且不授权。现在先授权，没连上时把装扩展的三步加在结果后面。

## 0.3.0 — 2026-11-09

- `/chrome authorize off` 之后五个工具真的消失：注册时按 `policy.authorizeOnStart` 决定活动状态，`authorize on` 挂上、`off` 摘掉，模型工具表与 codemode 描述一起变。此前授权只拦调用，工具定义一直在。

## 0.2.0 — 2026-11-09

- **BREAKING**：删掉 `prompt.guidelines`。默认三条规则搬进 `chrome_act` 自己的 `promptGuidelines`；跨工具的规则写 AGENTS.md。写了这个键的配置会以 `prompt: unknown key` 启动失败。
- `/chrome` 有参数补全：输入 `/chrome ` 列子命令，`/chrome authorize ` 列 on 与 off，每项带一句说明。
- 关掉某个工具后，系统提示里不再留下点名它的规则：此前全局规则里的三条 `chrome_act` 规则在关掉 `chrome_act` 后仍然保留。
- **BREAKING**：删掉 `policy.background` 与 `/chrome background`。点不动页面时由输入路径自己把标签与窗口带到前台；读操作照样不打扰。写了这个键的配置会以 `policy.background: unknown key` 启动失败。
- 输入前的可见性检查改成自救：不可见就激活标签、把窗口带到前台，仍不可见才报错并说清原因（标签非活动、窗口最小化、被盖住）。
- `chrome_tab new` 建的新标签在自己的窗口里是活动标签，不再出现「新标签点不动」。
- README 说清自动化窗口不聚焦地打开、第一次点击或打字会把它带到前台。

## 0.1.1 — 2026-11-09

- 补中文 README：`README.zh-CN.md`，英文版顶部有切换链接，npm 包同时收录两份。

## 0.1.0 — 2026-11-08

首版。

- 五个工具：`chrome_act`（navigate、click、type、fill、press、hover、drag、scroll、upload、eval、wait、batch）、`chrome_see`（refs、text、changes、full，另可取 console 与 network 日志）、`chrome_tab`（list、new、switch、close）、`chrome_vision`（截图落盘）、`chrome_cdp`（裸 CDP 调用）。
- `/chrome` 命令：`authorize on|off`、`background on|off`、`status`。扩展装好之前，命令与工具都报 `extension_missing` 并给出装扩展三步。
- 本地桥：只绑 `127.0.0.1`，多 Pi 会话共用一个服务端，其余退成客户端。扩展每 100 毫秒轮询一次。
- 每个会话一个独立的浏览器窗口：动作在本次会话的 target 里执行，别的窗口不动，退出时按配置关掉标签。
- 截图默认落在 `<agent dir>/pi-browser-use-lite/screenshots`，跟着 `PI_CODING_AGENT_DIR` 走，不写进家目录的 `~/.pi/screenshots`。
- 发布：`CHANGELOG.md` 与 `browser-extension/` 一起进 `files`。用户从 npm 装到扩展源码后 load unpacked。
- 扩展版本落后于包时自己重载一次，不必再去扩展页手动刷新。
- 轮询断了由扩展的 1 秒定时器重起；`chrome.alarms` 只作服务工作进程被回收后的兜底。
- `chrome_act eval` 省掉超长 `data` 时，说明接在正文末尾；此前这条说明到不了模型。
- 包内带 `README.md`：安装、配置、开发各一节，扩展目录由 `/chrome status` 打印。
