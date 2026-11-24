# SPEC · pi-ask-lite

> 契约 = 用户故事 + 验收表（AC）+ 不做的清单。改这三样，先改这里。字段、默认值、报错一律看源码。
> 为什么这么定，见 `docs/decisions/`。模块见 `docs/ARCHITECTURE.md`。术语见 `docs/GLOSSARY.md`。

## 问题

本机原来用 `@juicesharp/rpiv-ask-user-question`。取消走 `cancelled: true` 的工具结果，模型再回一轮，用户得按两次。单选点一下就提交，想补一句话要重走一遍。header 16 字符、label 60 字符，`Other` / `Next` 直接判违规。题目依赖链逼着用户按顺序点。配置写错静默吞掉。

需要的是：模型问一次，用户一次按键就有结论。取消就是取消。

## 用户故事

- 模型问一次，我用一次按键给结论。单选按数字或 Enter 就完，不用先高亮再确认。
- 想多选时 Space 勾几项，Enter 收题。
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
| ↑ / ↓ | 选项或 Custom 行 | 光标移动，两端夹住不循环 |
| Tab / Shift+Tab / ← / → | 任意 | 切下一题 / 上一题；单题无动作 |
| Space | 选项 | 多选切换勾选；单选无动作 |
| Enter | 选项 | 单选：选中并推进；多选：落地已勾选项并推进；该题既没勾选也没输入时不推进 |
| Enter | Custom 行 | 进 `custom` 编辑，带出已有草稿 |
| 可打印字符 | Custom 行 | 进 `custom` 编辑，该字符作为首个输入 |
| 1..9 | 任意 | 单选：选中第 N 项并推进；多选：切换第 N 项 |
| `keys.annotate`（默认 `e`） | 选项 | 单选进 `note` 编辑；多选无动作 |
| `keys.submitEarly`（默认 `ctrl+enter`） | 任意 | 至少一题有结论时进 `submit`，`skipped` 是未答下标；一题都没答时无动作 |
| Esc | 任意 | 进 `abort` |

推进 = 跳到下一道没结论的题，循环找。找不到未答题就进 `submit`。最后一题答完但前面还有漏题时，跳回漏题，不提前收尾。

`note` 编辑：单行。Enter 落地成该选项的 `note`（该选项尚未选中就先选中），该题算有结论，然后照常推进。Esc 只回 `list`，草稿留着，下次按 `e` 带回。

`list` 里 `e` 的起点：该选项已选中就用它的 `note`，否则用 `noteDrafts` 里的草稿。

`custom` 编辑：多行，Shift+Enter 换行，Enter 落地。Esc 只回 `list`，草稿保留。空白 Enter 等于清掉该题的 `custom`，回 `list`，不推进。

`abort`：整次放弃。`answers` 为空数组，已答的也丢；`aborted: true`。同时调 `ctx.abort()` 并给工具结果标 `terminate: true`（理由见 [`0001`](../decisions/0001-esc-aborts-turn.md)）。

`submit`：按题序写 `answers`。`skipped` 只在提前提交时非空。

部分提交的口子只有 `submitEarly`。Esc 不产出半成品。

### 界面

- 高度上限 = 终端行数 × `ui.maxHeightRatio`（默认 0.45，可配 0.2–0.8，向下取整，最少 6 行）。头部与底部提示行不裁。
- 超预算的裁剪顺序按布局分两种（并排的理由见 [`0004`](../decisions/0004-side-by-side-trim.md)）：
  - 上下堆叠：preview 行 → detail 行 → 选项窗口（滚动，保留焦点项与相邻两项）。
  - 左右并排：两栏各自按同一高度预算裁。左栏 detail 行 → 选项窗口，右栏独立裁 preview 行。右栏让出的行不能变成左栏高度，两栏不互相补偿。
- 单题不画 Tab 栏。多题时顶部一行 Tab 栏，每题一段，已答的段前标 ✓；只渲染当前题的选项。
- 每题一行标题（`title`，缺省用 `question` 首行），选项一行一个，`1.` 前缀加 label，`detail` 缩进续行。多选选中标 `✓`，单选用高亮。标题、label、`detail`、`note` 里的换行只取 `/\r?\n/` 切出的首行：`render()` 的每个元素必须是正好一行。
- Custom 行固定在该题选项下方，显示草稿摘要。
- 底部一行键提示，随 `list` / `note` / `custom` 换。
- preview：当前高亮选项带 `preview` 时显示。终端宽 ≥ `ui.preview.minSideBySideWidth`（默认 100）时在右侧并排，否则在该题下方堆叠。并排时各占一半宽，各自截断。
- `ui.bell` 为真时，提交与中止各响一次（`\x07`）。
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
    "preview": { "minSideBySideWidth": 100 }
  },
  "keys": { "annotate": "e", "submitEarly": "ctrl+enter" },
  "guidance": {
    "description": "...",
    "promptSnippet": "...",
    "promptGuidelines": ["tool-name: ..."]
  }
}
```

键、默认值、校验、报错在 `src/config.ts`，README 的配置节给人看。未知键与类型不符抛错并带字段路径，错误前缀 `pi-ask config <path>:`。`maxHeightRatio` 越界夹到 0.2–0.8。

`guidance` 三段都可覆盖，`tool-name` 占位符替换成实际工具名。

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
| AC1 | 配置用例：缺文件得默认值；坏 JSON、未知键、类型不符都抛错且带字段路径；`maxHeightRatio` 越界夹取；`tool-name` 每处都替换；改 `tools.ask.name` 后注册名跟着变 |
| AC2 | 校验用例：1 题 / 4 题、2 选项 / 6 选项的边界通过；0 题、5 题、1 选项、7 选项、空白 `question`、空白 `label`、未知键全部抛错；`multiple` 缺省 `false`；`Other` 与 `Next` 通过 |
| AC3 | 状态用例：迁移表逐条覆盖；自动推进跳过已答；最后一题答完回跳漏题；全答自动 `submit`；`submitEarly` 带 `skipped`；`note` / `custom` 的 Esc 只退编辑、草稿还在；列表态 Esc 得 `answers: []`、`aborted: true`；`done` 只触发一次 |
| AC4 | 渲染用例：宽度 80 / 100 / 120 × 高度 20 / 40。并排与堆叠切换、`…` 截断、预算裁剪顺序（堆叠 preview → detail → 选项窗口；并排左栏 detail → 选项窗口、右栏独立裁 preview）、单题无 Tab 栏、键提示随形态换 |
| AC5 | 接线用例：注册参数含 `exposure: "model-only"`；`mode !== "tui"` 时抛错且零事件；提交、中止、抛错三条路径 `herdr:blocked` 成对；工具结果的 `details` 形状与英文摘要；`terminate: true` 与 `ctx.abort()` 各一次 |
| AC6 | 包闸：`test/package.test.ts` 的 files / `pi.extensions` 断言与 `test/docs.test.ts` 的两份 README 配置块 = `DEFAULTS` 都通过 |
| AC7 | 全仓 `pnpm check` 绿：lint、check:imports、typecheck、test |
| AC8 | 真机：herdr 面板里 `pi -ne -e ./packages/pi-ask-lite/src/index.ts`。面板变红再恢复；单 Esc 回空闲且没有第二次模型回复；`e` 补充；preview 并排切堆叠；Ctrl+Enter 提前提交 |

## 不做的

- herdr 运行时依赖。只发事件。
- i18n 与多语言文案包。
- RPC / ACP 回退，以及任何外部答题通道（文件、HTTP、socket）。
- 独立备注编辑页、Submit 确认页、`ctrl+]` 折叠、overlay 兜底。
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
