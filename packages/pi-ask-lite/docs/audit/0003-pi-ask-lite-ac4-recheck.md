# AUDIT · pi-ask-lite AC4 复验（改契约后）

结论：通过。AC1–AC7 全部通过，退回开发解除。

## 验收

- AC4 通过 — `pnpm --filter pi-ask-lite exec vitest run test/view.test.ts`（20 passed）；补实跑探针见下。
- AC7 通过 — 仓库根 `pnpm check`：exit 0（改契约后重跑）。

## 一致性核对

| 位置 | 内容 | 与实现是否一致 |
|---|---|---|
| `docs/specs/0001-pi-ask-lite.md:116` | 堆叠：preview 行 → detail 行 → 选项窗口 | 一致 — `src/view.ts:196-212` 先按 `room = budget - body.length` 截 preview，room 为 0 才走 `trimRows` 丢 detail |
| `docs/specs/0001-pi-ask-lite.md:117` | 并排：两栏各自按同一高度预算；左栏 detail → 选项窗口；右栏独立裁 preview；互不补偿 | 一致 — `src/view.ts:181-195` 左栏 `trimRows(body, budget, focus)`、右栏 `preview.lines.slice(0, budget)`，左右互不读对方行数 |
| `docs/decisions/0004-side-by-side-trim.md` | 决定、为什么、代价 | 与 spec 同口径；`docs/decisions/README.md:10` 索引已加 |
| `docs/specs/0001-pi-ask-lite.md:172` | AC4 措辞含两种布局的裁剪顺序 | 一致 — `test/view.test.ts:111,175,196` 分别锁 detail、堆叠 preview、并排两栏 |
| `test/view.test.ts:286` | 80/100/120 × 20/40 矩阵 | 真实双重循环，断言行数、末行提示、无换行、宽度 |

## 实跑证据

- 并排 120×6（2 选项各带 detail，preview 7 行）：输出 `Alpha / Beta / Custom / 空行` 四行，右栏 `p1..p4`；detail 全丢、右栏不多占左栏高度。
- 堆叠 80×6（同上内容）：body 5 行已超预算 4 行，preview 一行不显示、detail 同批丢 — 与「preview 先裁」的顺序一致。
- 堆叠 80×8（1 个 detail + 6 行 preview）：`test/view.test.ts:175` 断言 detail 保留、`p2` 在、`p6` 不在，跑过。

## 遗留小瑕疵（不影响验收）

- `docs/specs/0001-pi-ask-lite.md:116-117` — 裁剪顺序没写 note 行位置；实现里 note 与 detail 同批丢。要写清可补一句。
- `src/view.ts:178` — `MIN_SIDE_BY_SIDE_WIDTH = 8` 在 `ui.preview.minSideBySideWidth` 下限 20 下永不生效，属死防御，可删。

## 下一步

`/skill:docs-commit` 提交；AC8 真机留在 `docs/todos/0002-smoke.md`。
