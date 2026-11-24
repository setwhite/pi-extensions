# AUDIT · pi-ask-lite 0001 复审

结论：退回开发。4 条缺陷修了 3 条；剩 1 条（并排裁剪顺序）没修，反而被测试锁死，且 spec 没改。

## 验收

- AC1 通过 — `pnpm --filter pi-ask-lite exec vitest run test/config.test.ts`
- AC2 通过 — `pnpm --filter pi-ask-lite exec vitest run test/schema.test.ts`
- AC3 通过 — `pnpm --filter pi-ask-lite exec vitest run test/state.test.ts test/index.test.ts`；上次那条「改选别的选项会丢掉旧 note」的假测试已改成真跑（两题、prevQuestion、digit 改选、断言 note 清空）
- AC4 未通过 — `test/view.test.ts` 已补 AC4 矩阵（80/100/120 × 20/40）、键提示切换、`…` 截断、选项窗口；但裁剪顺序仍与 spec 相反（见缺陷 3）
- AC5 通过 — `pnpm --filter pi-ask-lite exec vitest run test/index.test.ts`
- AC6 通过 — `pnpm --filter pi-ask-lite exec vitest run test/package.test.ts test/docs.test.ts`
- AC7 通过 — 仓库根 `pnpm check`：exit 0

## 缺陷复验（实跑）

- 缺陷 1 已修 — `src/view.ts:39` 头部改走 `oneLine(question.title ?? question.question)`；实测 80 列下 `title: "MyTitle"` 出现在首行，含 `\n` 的 question/label/detail 不再把换行带进 `render()` 元素（含换行行数 0）。
- 缺陷 2 已修 — `src/view.ts:236-243` 编辑行改留尾部；24 行终端、编辑器 5/7/9 行时末行与下边框都在（`hasLast=true hasBottomBorder=true`，总行数 10）。
- 缺陷 3 未修 — `src/view.ts:196-217` 并排时左栏仍先丢 detail、右栏保留预算内 preview；120×6 实测 `detail kept: false`、preview 保留 4 行，与 spec「preview 行 → detail 行 → 选项窗口」相反。
- 缺陷 4 已修 — `src/view.ts:169-181` 堆叠 preview 按整行截断、并排下限改 `MIN_SIDE_BY_SIDE_WIDTH = 8`；真实组件 width 8/10/12/13/14 最大行宽等于宽度，无超宽。

## 新增问题

- `test/view.test.ts:196` — 用例名与断言把「并排先丢 detail」写成期望，等于用测试锁死 spec 偏差；`git diff` 为空，spec 与 decisions 未同步。按仓库规则「改契约先改 spec」，这条要么改码，要么先改 spec 再留测试。

## 质量建议

- `src/schema.ts:121` — `if (input.length > 9) {}` 仍是空块，只有注释没有行为 — Subtract Before You Add。
- `src/index.ts:224-232` — 数字分支仍先于可打印字符：Custom 行按 `7`（超出选项数）既不进编辑器也不输入 — spec 迁移表两条规则冲突，需定一条。
- `src/index.ts:255` — 响铃写 `process.stdout` 且 `catch {}` 吞错 — Root-Cause & Fail Fast。
- `src/index.ts:298,302` — `render()` 里改 `focused`，渲染带副作用 — Functional Core, Imperative Shell。
- 更正上次误报 — `src/index.ts:71` 的 `SELECT_LIST_THEME` 不是重复造轮子：pi-tui 只导出 `SelectListTheme` 类型，没有默认实现，且 `EditorTheme.selectList` 必填，保留是对的。

## 安全前提

未回归：`src/index.ts` 的 `ctx.mode !== "tui"` 闸与 `herdr:blocked` 的 try/finally 未改，沿用 0001 的实跑证据。
