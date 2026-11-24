# CHANGELOG

本文件记录已发布版本的用户可见变更。更细的过程见 git log。破坏性变更标 **BREAKING**。

## 0.1.0 — 2026-11-24

- 首个版本。一个工具 `ask(questions)`：1–4 题，每题 2–6 个选项，可多选。
- 单选按数字或 Enter 就给结论；多选 Space 勾选。答完自动跳到下一道未答题，全答自动提交。
- 选项可就地写 `note`（默认 `e`）；每题底部有自由输入 `Custom…`，Shift+Enter 换行。
- Esc 整次中止：本轮结束，不向模型发送任何答案，不再追问。
- Ctrl+Enter 提前提交已答的题，未答的标 `skipped`。
- 选项的 `preview` markdown 在宽屏并排、窄屏堆叠。
- 配置在 `~/.pi/agent/pi-ask/config.json`：题数上限、高度占比、键位、工具名与模型提示文案。
