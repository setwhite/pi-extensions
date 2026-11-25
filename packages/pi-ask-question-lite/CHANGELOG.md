# CHANGELOG

本文件记录已发布版本的用户可见变更。更细的过程见 git log。破坏性变更标 **BREAKING**。

## 0.1.3 — 2026-11-25

- 无运行时变更：README 封面图挪到标题下面，语言切换挪到封面之后。
- 语言切换不再用加粗表示当前页：当前语言写成纯文本排第一，另一个才是链接，如 `English | [简体中文](README.zh-CN.md)`。

## 0.1.2 — 2026-11-25

- **BREAKING** 配置目录改成 `<agent dir>/pi-ask-question-lite/`，跟包名一致。旧的 `<agent dir>/pi-ask/config.json` 不再读取；要保留配置就挪目录：`mv ~/.pi/agent/pi-ask ~/.pi/agent/pi-ask-question-lite`。
- README 安装节改成 `pi install npm:pi-ask-question-lite`：包已在 npm 上。
- README 文档表补上 Audit、Todos 与 CHANGELOG，补 License 节。

## 0.1.1 — 2026-11-25

- 无运行时变更：README 加封面图，截的是 `ask` 问第 1 题（共 2 题）时的面板：左边题目与选项，右边预览，底部一行按键提示。
- 封面链接用 `raw.githubusercontent.com` 绝对地址：`assets/` 不在 `files` 里，相对路径在 npm 页面上是死链。

## 0.1.0 — 2026-11-24

- 首个版本。一个工具 `ask(questions)`：1–4 题，每题 2–6 个选项，单选或多选。
- 单选按数字或 `Enter` 就给结论，答完自动跳到下一道未答题，全答自动提交；多选按数字或 `Enter` 勾选，走到 `→ Confirm` 按 `Enter` 收题。
- 补充说明就地写：`e` 在该选项（及其 `detail`）正下方展开输入框。单选取中项那一条，多选每个选项各一条（`notes`），取消勾选连同草稿一起清掉。
- 每题底部有 `+ Custom…` 自由输入，`Shift+Enter` 换行。
- `Esc` 一次中止：本轮结束，不向模型发送任何答案，模型也不会再回一句。
- `Ctrl+Enter` 提前提交已答的题，未答的标 `skipped`。
- `Ctrl+]` 把面板折叠成一行进度，再按一次展开，焦点、答案与草稿都保留。
- 选项的 `preview` markdown 宽屏并排显示在右侧、窄屏堆叠在选项下方；并排时右栏从 Tab / 题干那一行就顶对齐，左栏宽度按整题内容定死，滚动选项不抖。
- 聊天记录只有一行调用与每题一行结果，补充说明写在对应选项名后；`Ctrl+O` 展开成完整题干与逐条选项。
- 面板占编辑器槽位，不盖对话区；高度上限由 `ui.maxHeightRatio` 决定（默认 0.45）。
- 仅 TUI：`rpc` / `json` / `print` 模式下调 `ask` 直接报错。
- 配置在 `~/.pi/agent/pi-ask/config.json`：题数上限、高度占比、键位、工具名与模型提示文案。
