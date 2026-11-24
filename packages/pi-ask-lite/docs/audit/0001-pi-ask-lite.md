# AUDIT · pi-ask-lite 0001

结论：退回开发。

## 验收

- AC1 通过 — `pnpm --filter pi-ask-lite exec vitest run test/config.test.ts`（9 passed）；补探针：三处 guidance 的 `tool-name` 都换成 `question`，坏 JSON 消息带绝对路径。
- AC2 通过 — `pnpm --filter pi-ask-lite exec vitest run test/schema.test.ts`（9 passed）；读断言：1/4 题、2/6 选项、0/5/1/7、空白 question/label、未知键、`multiple` 缺省、Other/Next 都有断言。
- AC3 通过 — `pnpm --filter pi-ask-lite exec vitest run test/state.test.ts`（22 passed）加 `test/index.test.ts`（12 passed）；补探针：kitty `ctrl+enter` 提前提交、done 后按键不再出口、tab/←/→/shift+tab/space 映射、note 草稿回填。
- AC4 未通过 — `pnpm --filter pi-ask-lite exec vitest run test/view.test.ts`（11 passed）。期望「超预算的裁剪顺序：preview 行 → detail 行 → 选项窗口」在并排布局也成立；实际 width 120 / height 6 时先删 detail，preview 保留 4 行（缺陷 3）。另有覆盖缺口：无 height 20 组合、无「键提示随形态换」断言、无 `…` 断言、无选项窗口断言。
- AC5 通过 — `pnpm --filter pi-ask-lite exec vitest run test/index.test.ts`（12 passed）；补探针：提交/中止/抛错三条路径 `herdr:blocked` 成对，`terminate: true` 与 `ctx.abort()` 各 1 次，`mode: "rpc"` 抛错且零事件。
- AC6 通过 — `pnpm --filter pi-ask-lite exec vitest run test/package.test.ts test/docs.test.ts`（5 + 2 passed）。
- AC7 通过 — 仓库根 `pnpm check`：exit 0，pi-ask-lite 7 files / 70 tests passed；单跑 `pnpm --filter pi-ask-lite run lint`（13 files clean）、`run check:imports`（ok: 5 files）、`run typecheck`（无输出）。

范围蔓延（小）— `src/index.ts:130`：`herdr:blocked` 的 `false` 事件额外带 `label`，spec 写 `{ active: false }`。

范围蔓延（小）— `src/config.ts:51,114,132`：`tools.ask.name` 正则、`maxQuestions >= 1`、`minSideBySideWidth >= 20` 是 spec 未写的硬错误；README 只列「坏 JSON、未知键、类型错」三类。

## 实跑缺陷与安全前提

- 缺陷 1（高）— `src/view.ts:38`：多行 `question` 会把 `\n` 带进 `render()` 的单个元素，`title` 不进头部。复现：`renderPanel(..., width 80)[0] === "Which one?\nExtra context"`，同一输入 `title: "MyTitle"` 完全不显示。违背 spec「每题一行标题（`title`，缺省用 `question` 首行）」与 pi-tui `Component.render`「每个元素一行」契约；宿主按行差分重绘，多出的换行会顶歪面板。`label` / `detail` 走同一条 `style.truncate`，同样漏 `\n`。
- 缺陷 2（高）— `src/view.ts:233,241`：Custom 多行编辑时编辑器尾部（含光标行）被裁。复现：80 列、24 行终端（height=10），Custom 写 7 行，`render(80)` 不含第 7 行；8 行时连下边框都没了。根因：`optionBudget = Math.max(1, ...)` 强制留 1 行选项，`pinned.slice(0, ...)` 从头部切编辑行，光标行在尾部。
- 缺陷 3（中）— `src/view.ts:193-212`：并排布局裁剪顺序与 spec 相反。复现：width 120 / height 6，2 个选项各带 `detail` + 5 行 `preview` → detail 行全部消失，preview 保留 p1..p4。期望先裁 preview 行。
- 缺陷 4（低）— `src/view.ts:171-174`：极窄终端堆叠 preview 超宽。复现：真实组件 width 12（真实 Markdown，columns=12）preview 行宽 14；width 13 仍宽 14；下面探针用 stub markdown，同条件行宽 13。`Math.max(12, width - 2)` 的下限比屏宽大，再加 2 空格前缀。默认 `TuiMainScreen` 对超宽行直接抛 `Rendered line ... exceeds terminal width`（pi-tui `tui-main-screen.js:475-492`），默认 `tuiMode` 是 regular，会崩 UI。
- 安全前提 — 宿主在 RPC 下 `hasUI === true` 但 `custom()` 返回 `undefined`，所以无 UI 闸必须看 `ctx.mode`：`@earendil-works/pi-coding-agent/dist/modes/rpc/rpc-mode.js:152`、`docs/rpc-extension-ui.md`「`custom()` returns `undefined`」。探针把 mode 伪装成 `tui`、`custom` 返回 `undefined` → `TypeError: Cannot read properties of undefined (reading 'kind')`，证明 `ctx.mode` 闸必要，`hasUI` 不够。非 overlay 默认与焦点归属也有一手证据：`modes/interactive/interactive-mode.js:2290` `options?.overlay ?? false`、`:2129` `setFocus(component)`、`pi-tui/dist/tui.js:780` 把按键送 `focusedComponent.handleInput`。

### 复现脚本（跑完已删，可原样重建到 `packages/pi-ask-lite/.tmp/repro.ts`）

```ts
import { stripTerminalSequences, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { createSession } from "../src/state.ts";
import { renderPanel } from "../src/view.ts";

const style = {
  accent: (t: string) => t, muted: (t: string) => t, bold: (t: string) => t,
  width: visibleWidth,
  truncate: (t: string, w: number) => stripTerminalSequences(truncateToWidth(t, w, "…")),
  markdown: (t: string, w: number) => t.split("\n").map((l) => truncateToWidth(l, w, "…")),
};
const layout = { width: 80, height: 40, keys: { annotate: "e", submitEarly: "ctrl+enter" }, minSideBySideWidth: 100 };
// 缺陷 1：头部带 \n，title 不显示
console.log(JSON.stringify(renderPanel(createSession([{ question: "Which one?\nExtra context", title: "MyTitle", multiple: false, options: [{ label: "A" }, { label: "B" }] }]), layout, style)[0]));

// 缺陷 3：并排先删 detail
const withDetail = [{ question: "Pick", multiple: false, options: [
  { label: "Alpha", detail: "detail alpha", preview: "p1\np2\np3\np4\np5" },
  { label: "Beta", detail: "detail beta" },
] }];
console.log(JSON.stringify(renderPanel(createSession(withDetail), { ...layout, width: 120, height: 6 }, style)));

// 缺陷 4：width 12 时一行宽 14
const withPreview = [{ question: "Pick", multiple: false, options: [{ label: "A", preview: "hello world" }, { label: "B" }] }];
console.log(renderPanel(createSession(withPreview), { ...layout, width: 12 }, style).map(visibleWidth));
```

缺陷 2 用 `test/index.test.ts` 的 fake ctx 跑真实组件：`tui.terminal = { rows: 24, columns: 80 }`，Custom 行输入 7 行文本，`component.render(80)` 不含最后一行。

## 质量建议

- `src/schema.ts:121` — `if (input.length > 9) {}` 空块只有注释，没有行为 — design-rules「Subtract Before You Add」。
- `src/index.ts:71` — 手写 identity `SELECT_LIST_THEME`，宿主已导出 `getSelectListTheme` — design-rules「Reuse Over Reinvent」。
- `src/index.ts:315` / `src/view.ts:121` — `truncate` 里 `stripTerminalSequences` 会把 `renderTabs` 先上的色剥掉（实测 Tab 行无 ANSI，活动题不高亮）— 渲染一致性。
- `src/index.ts:224-232` — 数字分支先于可打印字符：Custom 行按 `7`（超出选项数）既不进编辑器也不输入，用户无法以该字符开头 — spec 迁移表「1..9 任意」与「可打印字符 Custom 行」冲突，需定一条。
- `src/index.ts:255` — 组件直接写 `process.stdout` 响铃并 `catch {}` 吞错 — design-rules「Root-Cause & Fail Fast」。
- `src/index.ts:298,302` — `render()` 里改 `focused`，渲染带副作用 — design-rules「Functional Core, Imperative Shell」。
- `src/config.ts:51` — 工具名正则与 limits 下限没写进 README 的抛错清单 — docs-rules「SSOT」。
- `src/view.ts:173,182` — `previewLines` 与 `leftColumnWidth` 两处 `Math.max(12, ...)` 魔数，是缺陷 4 的根因 — design-rules「Minimize Reader Load」。
- `test/view.test.ts:124,126` — 同一断言写两遍 — 测试冗余。
