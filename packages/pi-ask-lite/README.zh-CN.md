# pi-ask-lite

**[简体中文](README.zh-CN.md)** | [English](README.md)

一个工具 `ask(questions)`：模型问 1–4 题，每题 2–6 个选项，用户一次按键就给结论。Esc 整次中止本轮，模型不会再来一句，也不会拿到半成品答案。本包没有运行时依赖。

## 功能

- 单选：`Enter` 或数字键选中当前项，自动跳到下一道未答题；多选：`Enter` 或数字键勾选/取消当前项，走到 `→ Confirm` 按 `Enter` 收题。
- 每题底部有 `+ Custom…` 自由输入行。`Shift+Enter` 换行，`Enter` 提交。
- 分割线以下统一缩进 2 格、分段之间不留空行，焦点行用 `›` 标，底部只列当前模式真能用的键（`ui.showHints: false` 关掉这一行）。
- `e` 在当前选项上写补充说明，随答案一起带走。
- `Ctrl+Enter` 提前提交已答的题，其余标成 skipped。
- `Esc` 中止。本轮立刻结束，模型拿不到任何答案。
- Tab 栏用 `title`（缺省 `Q1`、`Q2`…）当标签并高亮当前题；完整 `question` 始终在下方按宽折行显示。
- `Ctrl+]` 把面板折叠成一行进度，再按一次展开；焦点、答案与草稿都保留。改 `keys.collapse` 换键，设 `off` 关闭。
- 聊天记录里调用行是 `Ask <title1 · title2>`，结果每题一行 `✓ <title>: <answer>`，没答的题 dim 标 `skipped`。
- 选项可以带 Markdown 的 `preview`。宽终端显示在选项右侧，窄终端堆叠在下方。
- 对话框占编辑器槽位，不盖对话区。高度上限由 `ui.maxHeightRatio` 决定。

## 安装

还没发到 npm。在仓库里直接跑：

```bash
pi -ne -e ./packages/pi-ask-lite/src/index.ts
```

## 键位

| 键 | 作用 |
| --- | --- |
| `↑` / `↓` | 在选项、`+ Custom…` 与（多选）`→ Confirm` 之间移动 |
| `Tab` / `Shift+Tab` / `←` / `→` | 切题 |
| `1`–`9` | 选第 N 个选项（多选时切换勾选） |
| `Enter` | 单选：选中并推进；多选：勾选/取消，或在 `→ Confirm` 上收题 |
| `e` | 给当前选项写补充说明（`keys.annotate`） |
| `Ctrl+Enter` | 提前提交（`keys.submitEarly`） |
| `Ctrl+]` | 折叠 / 展开面板（`keys.collapse`） |
| `Esc` | 中止本轮，或退出当前编辑 |

## 配置

配置文件是 `<agent dir>/pi-ask/config.json`。`<agent dir>` 取 `$PI_CODING_AGENT_DIR`，未设置时取 `~/.pi/agent`。目录名是 `pi-ask`，不是包名。

扩展只读这个文件，不写。文件不存在时全部取默认值。

下列情况抛出错误：JSON 损坏、键名未知、类型错。消息带绝对路径，每个错误一行 `字段路径: 原因`。`ui.maxHeightRatio` 超出 0.2–0.8 时夹到边界。

**最小配置**：零配置即可用。要压矮对话框，改 `ui.maxHeightRatio`。

```json
{
  "ui": { "maxHeightRatio": 0.3 }
}
```

**完整配置**：下面列出全部键，取值即默认值。`//` 只是注释，实际文件里删掉。

```jsonc
{
  "tools": { "ask": { "name": "ask" } },             // 工具名
  "limits": {
    "maxQuestions": 4,                               // 每次最多几题
    "maxOptions": 6                                  // 每题最多几个选项
  },
  "ui": {
    "maxHeightRatio": 0.45,                          // 对话框高度占比（0.2–0.8）
    "bell": true,                                    // 弹窗挂载时响一次
    "showHints": true,                               // 是否画底部快捷键行
    "preview": { "minSideBySideWidth": 100 }         // 窄于此宽度时预览改为堆叠
  },
  "keys": {
    "annotate": "e",                                 // 在当前选项上写补充说明
    "submitEarly": "ctrl+enter",                     // 提交已答的题，其余跳过
    "collapse": "ctrl+]"                             // 折叠成一行；"off" 关闭
  },
  "guidance": {                                      // 模型看到的文案；`tool-name` 换成工具名
    "description": "Ask structured questions when user intent or trade-offs are unclear.",
    "promptSnippet": "",                             // 工具清单那一行；空串 = 不出现
    "promptGuidelines": [
      "tool-name: Check code, docs, or tools first; only ask when user intent or trade-offs are unclear.",
      "tool-name: Ask only independent questions together; defer follow-ups that depend on earlier answers.",
      "tool-name: Put the recommended option first, keep `label` short, and explain trade-offs in `detail`.",
      "tool-name: Put concrete examples, code, or layouts in `preview` when options differ in behavior.",
      "tool-name: Set `multiple: true` only when choices are not mutually exclusive."
    ]
  }
}
```

`guidance.promptSnippet` 为空串时不注册工具清单那一行。另外两段里的 `tool-name` 换成工具名。

`keys.submitEarly` 默认 `ctrl+enter`，只有 Kitty 协议的终端能区分。老终端发裸 `\r`，这个键等同 `Enter`。介意就换一个。

`keys.collapse` 取 `off` 或严格按键：修饰键按 `ctrl+shift+alt+super` 顺序，后面接单个字母、数字、符号或特殊键名。不能占导航键（含老终端别名 `ctrl+m`、`ctrl+j`、`ctrl+i`、`ctrl+[`、`ctrl+h`），也不能和 `keys.annotate` / `keys.submitEarly` 重复。

## 文档

| | |
| --- | --- |
| [架构](docs/ARCHITECTURE.md) | 模块、依赖规则、测试边界 |
| [规格](docs/specs/0001-pi-ask-lite.md) | 契约、验收标准、不做的 |
| [决策](docs/decisions/README.md) | 一条决策一份文件 |
| [术语](docs/GLOSSARY.md) | 每个词指什么 |
