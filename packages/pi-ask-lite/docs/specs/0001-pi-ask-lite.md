# SPEC · pi-ask-lite

> 契约 = 用户故事 + 验收表（AC）+ 不做的清单。改这三样，先改这里。字段、默认值、报错一律看源码。
> 为什么这么定，见 `docs/decisions/`。模块见 `docs/ARCHITECTURE.md`。术语见 `docs/GLOSSARY.md`。

## 问题

本机原来用 `@juicesharp/rpiv-ask-user-question`。取消走 `cancelled: true` 的工具结果，模型再回一轮，用户得按两次。单选点一下就提交，想补一句话要重走一遍。header 16 字符、label 60 字符，`Other` / `Next` 直接判违规。题目依赖链逼着用户按顺序点。配置写错静默吞掉。

需要的是：模型问一次，用户一次按键就有结论。取消就是取消。

## 用户故事

- 模型问一次，我用一次按键给结论。单选按数字或 Enter 就完，不用先高亮再确认。
- 想多选时 Enter 勾几项，走到 Confirm 行收题。
- 面板挡着上下文时折叠成一行，再按一次展开，已答与草稿都还在。
- 选中项想补一句，按 `e` 就地写，不换页。
- 选项带代码或表格时，右侧先看一眼再决定。屏幕窄了改成上下排。
- 多选题除勾选外还能写一段自由文本。
- 前面还有题没答、最后一题先答完了：别自作主张收尾，跳回漏题。
- 答到一半不想答了：Esc 一次退出，模型别再回一句，也别把半成品当答案。
- 只想交已答的几题：Ctrl+Enter，未答的标成 `skipped`。
- 工具名和给模型的提示能改。配置写错立刻看到字段路径。
- 问答期间还能往上翻对话。

## 契约

### 工具与结果

`ask(questions)`：1 到 `limits.maxQuestions`（默认 4）题，每题 2 到 `limits.maxOptions`（默认 6）个选项。

```ts
type Question = {
  title?: string;
  question: string;
  multiple?: boolean;
  options: Option[];
};
type Option = { label: string; detail?: string; preview?: string };
```

Parse, Don't Validate：`src/schema.ts` 是唯一入口，出口就是上面两个类型，下游不再校验。硬错误只有五类：题数为空或超限、`question` 空白、选项数越界、`label` 空白、未知键或类型不符（报错带字段路径）。`title` / `label` 超宽只在界面截断。`Other`、`Next` 照常放行。`multiple` 缺省 `false`。

`preview` 是选项对应的 Markdown 原文，只在界面渲染，不改写。

结果：

```ts
type AskDetails = {
  answers: Answer[];
  skipped?: number[];
  aborted: boolean;
};
type Answer = {
  index: number;
  question: string;
  selected: number[];
  custom?: string;
  note?: string;
  preview?: string;
};
```

`content[0].text` 是一句英文摘要，给模型读。`details` 给界面、回放和脚本调。

不变量：`selected` 升序去重；单选长度不超过 1；`note` 只在单选且 `selected.length === 1` 时出现；`custom` 去空白非空才写；`preview` 取第一个选中项的原文。有结论 ⟺ `selected` 非空或 `custom` 非空。

### 状态机

```ts
type Phase =
  | { kind: "list" }
  | { kind: "note"; option: number; initial: string }
  | { kind: "custom"; initial: string }
  | { kind: "done"; outcome: Outcome };

type Outcome =
  | { kind: "submit"; answers: Answer[]; skipped: number[] }
  | { kind: "abort" };
```

`done` 只进一次。`done()` 被重复调用必须无效。

`list` 上的迁移：

| 输入 | 焦点 | 结果 |
|---|---|---|
| ↑ / ↓ | 选项、Custom 行（多选再加 Confirm 行） | 光标移动，两端夹住不循环 |
| Tab / Shift+Tab / ← / → | 任意 | 切下一题 / 上一题；单题无动作 |
| Enter | 选项 | 单选：选中并推进；多选：切换勾选，不推进（见 [`0005`](../decisions/0005-multi-confirm-row.md)） |
| Enter | Custom 行 | 进 `custom` 编辑，带出已有草稿 |
| Enter | Confirm 行（仅多选） | 本题收尾并推进；本题没结论也照常推进，收尾时进 `skipped` |
| 可打印字符 | Custom 行 | 进 `custom` 编辑，该字符作为首个输入 |
| 1..9 | 任意 | 单选：选中第 N 项并推进；多选：切换第 N 项 |
| `keys.annotate`（默认 `e`） | 选项 | 单选进 `note` 编辑；多选无动作 |
| `keys.submitEarly`（默认 `ctrl+enter`） | 任意 | 至少一题有结论时进 `submit`，`skipped` 是未答下标；一题都没答时无动作 |
| `keys.collapse`（默认 `ctrl+]`，`off` 关闭） | 任意 | 列表态折叠 / 展开；折叠时只认它与 Esc，其余输入不改状态 |
| Esc | 任意 | 进 `abort` |

推进 = 从下一题起循环找没结论的题。找不到未答题就进 `submit`。最后一题答完但前面还有漏题时，跳回漏题，不提前收尾。

`note` 编辑：单行。Enter 落地成该选项的 `note`（该选项尚未选中就先选中），该题算有结论，然后照常推进。Esc 只回 `list`，草稿留着，下次按 `e` 带回。

`list` 里 `e` 的起点：该选项已选中就用它的 `note`，否则用 `noteDrafts` 里的草稿。

`custom` 编辑：多行，Shift+Enter 换行，Enter 落地。Esc 只回 `list`，草稿保留。空白 Enter 等于清掉该题的 `custom`，回 `list`，不推进。

`abort`：整次放弃。`answers` 为空数组，已答的也丢；`aborted: true`。同时调 `ctx.abort()` 并给工具结果标 `terminate: true`（理由见 [`0001`](../decisions/0001-esc-aborts-turn.md)）。

`submit`：按题序写 `answers`，`skipped` 是未答的下标（全答完收尾时为空）。

部分提交的口子只有 `submitEarly` 与多选的 Confirm 行：Confirm 跳过没结论的题时，那题进 `skipped`。Esc 不产出半成品。

### 界面

- 高度上限 = 终端行数 × `ui.maxHeightRatio`（默认 0.45，可配 0.2–0.8，向下取整，最少 6 行）。头部与底部提示行不裁。
- 超预算的裁剪顺序按布局分两种（并排的理由见 [`0004`](../decisions/0004-side-by-side-trim.md)）：
  - 上下堆叠：preview 行 → detail 行 → 选项窗口（滚动，先留焦点项，再按距离补相邻项；Custom 与 Confirm 行优先保留，预算连它们都放不下时先保焦点项）。
  - 左右并排：两栏各自按同一高度预算裁。左栏 detail 行 → 选项窗口，右栏独立裁 preview 行。右栏让出的行不能变成左栏高度，两栏不互相补偿。
- 面板顶部一条 dim 通栏分割线。Tab、题干、选项、底部提示一律贴第 0 列，不留左缩进，好和下方的 Pi 原生 footer 左对齐；分段之间不留空行，垂直空间全给内容。
- 单题不画 Tab 栏。多题时顶部一行 Tab 栏，每题一段，标签用 `title`，缺省 `Q1`…`Qn`，已答段前标 ✓；当前题用 accent 加粗并加方括号（如 `[2 细节]`），其余 dim。`title` 只做 Tab 标签，不替代题干。
- 题干永远完整渲染，按宽自动折行（可多行）。选项一行一个：单选用 `› 1. label` 标焦点、`✓ 1. label` 标已选，不画 `○`/`●`；多选用 `› ■ 1. label` 与 `□ 2. label`。`detail` 缩进到 label 列，高度充裕时最多折 2 行，超出用 `…`。label、detail、note 里的换行只取 `/\r?\n/` 切出的首行：`render()` 的每个元素必须是正好一行。
- Custom 行固定在该题选项下方：未聚焦时 dim 显示 `+ Custom…`（有草稿显示 `+ Custom: …`），聚焦换 accent。多选在 Custom 下方再加一行 `→ Confirm`（平时 dim，聚焦 accent）。
- 补充说明就地编辑：按 `e` 后该选项保持高亮，单行输入框紧贴该选项（或它的 `detail`）正下方，缩进到 label 列并加 `↳ ` 前缀，不另占一行提示。
- 自由输入编辑：保留高亮的 `› + Custom` 行，编辑区紧贴其下，用左侧 dim 的 `▎ ` 竖条标示输入行，不画上下边框。
- 底部一行 dim 键提示，只列当前形态真能用的键：单选用 `enter pick · e note`，多选用 `enter toggle`；多题补 `tab next` 与 `keys.submitEarly submit`，多选单题补 `keys.submitEarly submit`；`keys.collapse` 有效时再补 `<key> collapse`，最后收在 `esc abort`（键 + 动作，与其余提示一致）。编辑态是 `enter save · esc back`（custom 补 `shift+enter newline`）。`ui.showHints` 为假时整行不画，正文多一行。
- `keys.collapse` 有效时，列表态按它折叠：只剩一行 dim 的 `Ask collapsed (已答/总题数) · <key> expand`，不再画分割线与正文；再按同键展开，焦点、答案与草稿原样。折叠时别的输入不生效，Esc 仍中止。
- preview：当前高亮选项带 `preview` 时显示，不画 `Preview` 标头，正文直接起，省下的那一行留给内容。终端宽 ≥ `ui.preview.minSideBySideWidth`（默认 100）时在右侧并排，竖线 `│` 用 dim，左右各留 1 格；否则在该题下方堆叠。并排时右栏从 Tab / 题干那一行就顶对齐，不等选项区，右栏多出的行不把面板往下撑高。左栏宽封顶 `min(floor(width × 0.42), 54)`，封顶内按左侧实际内容最大宽度收紧，其余给右栏，各自截断，并且截断与补齐必须保留左侧的 ANSI 样式（选中高亮、detail 的 dim 不能被剥成纯白）。两栏都不低于 12 列，不够就退回堆叠。
- `ui.bell` 为真时，对话框挂载响一次（`\x07`）；提交、中止与退出都不再响。
- 聊天记录里，调用行是 `Ask <title1 · title2>`（`title` 缺省取 `question` 首行）；结果每题一条 `✓ <title>: <answer>`，没答的题用 dim 标 `<title>: skipped`，中止是 dim 的 `✗ aborted`。原始 JSON 参数与模型摘要不直接铺在聊天里。
- 挂载用 `ctx.ui.custom()` 的非 overlay 形态，占编辑器槽位（理由见 [`0002`](../decisions/0002-inline-editor-slot.md)）。

### 配置

`$PI_CODING_AGENT_DIR/pi-ask/config.json`，没设环境变量时是 `~/.pi/agent/pi-ask/config.json`。只读，文件缺失走默认值，不改写。

```jsonc
{
  "tools": { "ask": { "name": "ask" } },
  "limits": { "maxQuestions": 4, "maxOptions": 6 },
  "ui": {
    "maxHeightRatio": 0.45,
    "bell": true,
    "showHints": true,
    "preview": { "minSideBySideWidth": 100 }
  },
  "keys": { "annotate": "e", "submitEarly": "ctrl+enter", "collapse": "ctrl+]" },
  "guidance": {
    "description": "...",
    "promptSnippet": "",
    "promptGuidelines": ["tool-name: ..."]
  }
}
```

键、默认值、校验、报错在 `src/config.ts`，README 的配置节给人看。未知键与类型不符抛错并带字段路径，错误前缀 `pi-ask config <path>:`。`maxHeightRatio` 越界夹到 0.2–0.8。`keys.collapse` 取 `off` 或严格按键：修饰键按 `ctrl+shift+alt+super` 顺序，基键是单个字母 / 数字 / 符号或特殊键名；不能占导航键（含 `ctrl+m`、`ctrl+j`、`ctrl+i`、`ctrl+[`、`ctrl+h` 这些老终端别名），也不能和 `keys.annotate` / `keys.submitEarly` 重复。

`guidance` 三段都可覆盖，`tool-name` 占位符替换成实际工具名。`promptSnippet` 默认空串，空串不注册工具清单那一行；`description` 与 `promptGuidelines` 的默认文案在 `src/config.ts`。

### 宿主协作

- 无 UI 时：`ctx.mode !== "tui"` 直接抛错，不挂组件、不发事件。RPC 模式 `hasUI` 为真但 `custom()` 返回 `undefined`，没有可用回退（见 [`0003`](../decisions/0003-tui-only.md)）。
- `herdr:blocked`：调 `custom()` 前发 `{ active: true, label: toolName }`，`finally` 里发 `{ active: false }`。提交、中止、抛错三条路径都要成对。
- 工具声明 `exposure: "model-only"`。
- Esc 由组件自己收：宿主把焦点交给 custom 组件，编辑器的 `onEscape` 不触发。
- PageUp / PageDown / 滚轮不在组件里处理。宿主 alt-screen 在输入送进焦点组件之前就拦下它们，组件吞掉反倒会挡住翻页。

## 测试与验收

- 根 `test/` 按模块镜像。`index.ts` 用 fake api + fake ctx。只断言我们交给宿主的东西：注册的文案与 schema、发出的 `herdr:blocked`、工具结果、渲染出的行。不测 pi 自己的校验与渲染。
- 渲染用例把宽度、高度当参数传（80 / 100 / 120、20 / 40），不读 `process.stdout`。
- 配置用例注入 `configPath` 与 `env`，不碰真实 home。
- 除 AC8 外都能无终端跑。

| | 验收 |
|---|---|
| AC1 | 配置用例：缺文件得默认值；坏 JSON、未知键、类型不符都抛错且带字段路径；`maxHeightRatio` 越界夹取；`keys.collapse` 支持 `off`，格式不严、占导航键、与 `annotate` / `submitEarly` 重复都抛错；`ui.showHints` 校验；`tool-name` 每处都替换；改 `tools.ask.name` 后注册名跟着变 |
| AC2 | 校验用例：1 题 / 4 题、2 选项 / 6 选项的边界通过；0 题、5 题、1 选项、7 选项、空白 `question`、空白 `label`、未知键全部抛错；`multiple` 缺省 `false`；`Other` 与 `Next` 通过 |
| AC3 | 状态用例：迁移表逐条覆盖；多选 Enter 只勾选、Confirm 行收题、空 Confirm 记 `skipped`；自动推进跳过已答；最后一题答完回跳漏题；全答自动 `submit`；`submitEarly` 带 `skipped`；折叠只翻标志、焦点 / 答案 / 草稿不动，折叠时其它动作不生效而 Esc 仍中止；`note` / `custom` 的 Esc 只退编辑、草稿还在；列表态 Esc 得 `answers: []`、`aborted: true`；`done` 只触发一次 |
| AC4 | 渲染用例：宽度 80 / 100 / 120 × 高度 6 / 20 / 40。并排与堆叠切换、`…` 截断、预算裁剪顺序（堆叠 preview → detail → 选项窗口；并排左栏 detail → 选项窗口、右栏独立裁 preview）、单题无 Tab 栏、内容贴第 0 列、无空行、题干完整折行、当前 Tab 高亮、`›` / `✓` / `■` / `□` 前缀、Confirm 行、note 就地编辑、custom 编辑无边框、左栏封顶 `min(floor(width × 0.42), 54)` 并按内容收紧、右栏从 Tab / 题干行顶对齐、detail 折 2 行、键提示随形态与题型换（`esc abort` / 编辑态 `esc back`）且随 `collapse` 开关增减、`showHints` 关掉整行、折叠态只有一行进度、并排截断保留 ANSI |
| AC5 | 接线用例：注册参数含 `exposure: "model-only"`；`mode !== "tui"` 时抛错且零事件；提交、中止、抛错三条路径 `herdr:blocked` 成对；工具结果的 `details` 形状与英文摘要；`renderCall` 只显示 `Ask` 与题目标签、`renderResult` 出每题 `✓` 与 dim `skipped` / `✗ aborted`；铃只在挂载响一次；`terminate: true` 与 `ctx.abort()` 各一次 |
| AC6 | 包闸：`test/package.test.ts` 的 files / `pi.extensions` 断言与 `test/docs.test.ts` 的两份 README 配置块 = `DEFAULTS` 都通过 |
| AC7 | 全仓 `pnpm check` 绿：lint、check:imports、typecheck、test |
| AC8 | 真机：herdr 面板里 `pi -ne -e ./packages/pi-ask-lite/src/index.ts`。面板变红再恢复；单 Esc 回空闲且没有第二次模型回复；`e` 补充；多选 Enter 勾选后走 `→ Confirm`；`ctrl+]` 折叠成一行再展开；preview 并排切堆叠；Ctrl+Enter 提前提交；聊天记录里只看得到一行调用与每题一行结果 |

## 不做的

- herdr 运行时依赖。只发事件。
- i18n 与多语言文案包。
- RPC / ACP 回退，以及任何外部答题通道（文件、HTTP、socket）。
- 独立备注编辑页、Submit 确认页、overlay 兜底。
- `dependsOn` / `showIf` 条件题图。
- Ctrl+G 外置编辑器。首版只有内联多行。
- 第三方运行时依赖，除宿主 peer（pi-coding-agent / pi-tui / typebox）。
- 跨轮记忆答题进度：一次调用一次问答，答完即弃。
- 发布接线：根 README 包表、`npm-publish.yml` 矩阵、npm 上线。

这份清单是契约。要加，先改这份 spec。

## 其他

- **影响范围**：新增 `packages/pi-ask-lite`。不改其他包。根脚本 `pnpm -r` 会自动覆盖新包。
- **回退**：删目录。没有持久化状态，不碰用户配置。
- **交付形态**：源码运行（`pi -ne -e`），本轮不发 npm。
- **已知偏差**：
  - `ctrl+enter` 只有 Kitty 协议的终端能区分。老终端发裸 `\r`，退化成 Enter，等于确认当前题。用户可改 `keys.submitEarly`。
  - 中止会在会话里留一条工具结果，下一轮模型看得到（见 [research 0001](../research/0001-abort-on-esc.md)）。
  - Esc 落在多个工具同批执行时，同批未开始的工具被取消。这是宿主行为，不是本扩展的选择。
