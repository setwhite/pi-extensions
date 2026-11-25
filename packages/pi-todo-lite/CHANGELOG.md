# CHANGELOG

本文件记录已发布版本的用户可见变更。更细的过程见 git log。破坏性变更标 **BREAKING**。

## 0.4.3 — 2026-11-25

- 无运行时变更：README 封面换成落在右上角浮窗里的实拍截图，已完成项带删除线。中英两版同图，alt 文案按截图改成「浮窗在右、工具调用在左」。
- 封面链接改用 `raw.githubusercontent.com` 绝对地址：`assets/` 不在 `files` 里，包里没有这张图，相对路径在 npm 页面上是死链。

## 0.4.2 — 2026-11-24

- 修：折叠后底栏那一行不再随模型更新而消失。此前折叠时卸载浮窗，后续更新读不到终端宽度，就把整行写成空；现在拿不到宽度不截断，交给底栏自己按终端宽截。
- 修：浮窗或弹层挂载失败后不再卡住。此前失败的句柄仍被当成已挂/已开，之后只对着旧句柄要求重绘，不会重试；现在只清自己那份，下一次任务更新会重新挂上。

## 0.4.1 — 2026-11-24

- 修：角落浮窗不再常驻。空表、折叠、无 UI 时释放 `ctx.ui.custom`，只在有任务且展开时挂。此前浮窗从会话启动挂到退出，pi 一直发 `ui_prompt_start`，别的扩展（herdr 状态上报、子代理上报）把 pane 当成一直在等用户回答（DEC-0008）。
- `alt+t` 折叠改为卸载浮窗、底栏留一行；`session_compact` 与 `session_tree` 现在也重置折叠。

## 0.4.0 — 2026-11-24

- **BREAKING**：任务表不再挂在输入框上下，不再占对话区行数。旧键 `ui.widget.placement` 删掉，配置里写了它直接报错，并指出新字段路径。
- 新增 `ui.mode`：`overlay`（默认）把表放进角落浮窗，不抢键盘焦点、不影响 `PageUp`/`PageDown`；`status` 只在底栏写一行，按 `alt+t` 才弹出整张表。
- 新增 `ui.overlay`：`anchor`（九宫格，默认 `top-right`）、`width`（列数或百分比，默认 36）、`minTerminalWidth`（默认 100）、`margin`。终端窄于 `minTerminalWidth` 时浮窗不显示，底栏留一行进度；宽回来或清空任务时撤掉。
- `alt+t` 语义分档：`overlay` 档把浮窗压成一行（表头加第一条进行中），不撤窗；`status` 档开关整张表。任务表都不动。

## 0.3.1 — 2026-11-21

- 表格按终端显示宽度截断：中文、emoji 这类双宽字符按 2 列算，窄终端下不再换行把行预算撑破。宽度交给宿主的 `truncateToWidth`，此前只按 code point 截断。终端的 ANSI 与宽字符规则跟 pi 其余界面保持一致。

## 0.3.0 — 2026-11-03

- `/todos` 有参数补全。输入 `clear`、`export` 或 `import` 时列出候选，Tab 收下当前项。关掉的子命令不列。
- `/todos import ` 之后列会话目录下的文件与目录。目录带 `/`。带空格的路径自动加引号。
- 命令列表里 `/todos` 的说明写出子命令：`clear | export | import <file>`。pi 不给扩展命令转发参数提示语，这句说明是唯一提示。
- 发布：`CHANGELOG.md` 进 `files`。pi 在扩展更新后，于 "Extension Updates" 下显示比上次所见版本更新的条目。

## 0.2.0 — 2026-11-01

- **BREAKING**：源码并入 [setwhite/pi-extensions](https://github.com/setwhite/pi-extensions)，只从 npm 安装。pi 的 git 安装只认仓库根，指不到子目录。`git:` 安装留在旧仓，不再更新。
- 开发：CI、发布、提交前闸、lockfile 与行尾策略收成仓库一份。提交前闸改跑全部三个包。

## 0.1.6 — 2026-11-01

- **行为变更**：widget 行预算溢出时，未完成项先占行。剩下的行按表序补已完成项。仍放不下时，收成 `+N more`。原先空出的行不复用：1 条未完成加 8 条已完成，原先只用 3 行（1 行任务加 `+8 more`），现在用满 `maxLines`。

## 0.1.5 — 2026-10-25

- 无运行时变更：README 澄清 `guidance` 的空值语义。缺键才回退默认值。显式空串与空数组是覆盖。补充三条对应测试。

## 0.1.4 — 2026-10-25

- 无运行时变更：文档重组。spec 瘦身为契约，决策拆成单文件，新增 ARCHITECTURE 与 GLOSSARY。README 中英两版按 ASD-STE10 重写，代码注释精简。

## 0.1.3 — 2026-10-22

- 无运行时变更（运行时与 0.1.2 相同）。仓库加了发布物与依赖方向的执行器与提交前闸。CI 与发布流水线加固：action 按 commit SHA 固定，lint 挡 warning，publish 前对真实 tarball 断言，每日依赖审计。

## 0.1.2 — 2026-10-21

- 无功能变更。重新发布，以触发 npm 搜索索引重建。0.1.1 未被 `/-/v1/search` 索引，pi.dev 列表未收录。

## 0.1.1 — 2026-10-18

- **行为变更**：自动清空从「模型这波活干完（`agent_settled`）」挪到「用户发下一条消息（`input`）」。`lifecycle.onFinish` 的默认档由 `model` 改成 `clear`。已完成的表会留到用户发下一条消息。想立刻收起，按 `alt+t`。要恢复旧行为，写 `"onFinish": "model"`。
- `clear` 档下不再注册「干完发 `tasks: []` 能清空」的 guideline。模型侧文案由 141 字符缩到 80。
- 文档：npm 安装去掉「暂不可用」标记。

## 0.1.0 — 2026-10-18

- 首个发布。
- 工具 `todo(tasks)`：一次调用提交完整有序表，整表替换。`tasks: []` 表示清空。没有 id、key、action、baseVersion。
- 输入框上方常驻任务表：默认最多 9 行，溢出先丢已完成的项。`alt+t` 折叠，任务表不动。
- compaction、切分支、`--continue` 之后自动回放。状态只写 `pi-todo-state` 快照这一条账。
- `/todos` 全列清单，`/todos clear` 清空，`/todos export` 导出 markdown，`/todos import <file>` 读回。
- 配置 `<agent dir>/pi-todo/config.json`：扩展只读。JSON 坏、未知键、类型或枚举错抛错，并带字段路径。数值越界 clamp。
- `lifecycle.onFinish` 三档：`model`（默认）/ `keep` / `clear`。
- 零运行时依赖。
