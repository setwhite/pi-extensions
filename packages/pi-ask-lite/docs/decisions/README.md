# 决策

当前设计：一个工具 `ask(questions)`，一次调用问 1–4 题，每题 2–6 个选项。单选用一次按键就有结论，Esc 整次中止。界面挂在编辑器槽位。代码见 [ARCHITECTURE](../ARCHITECTURE.md)，契约见 [SPEC-0001](../specs/0001-pi-ask-lite.md)。

每条说清三件事：定成什么、为什么、代价。要推翻哪条，先看这里的理由，再新开一条注明取代关系。正文引用写 `DEC-0001`。术语见 [GLOSSARY](../GLOSSARY.md)。

- [0001](0001-esc-aborts-turn.md) Esc 整次中止：`ctx.abort()` 加 `terminate: true`
- [0002](0002-inline-editor-slot.md) 挂编辑器槽位，不用 overlay
- [0003](0003-tui-only.md) 只支持 TUI：`mode` 不是 `tui` 就报错
- [0004](0004-side-by-side-trim.md) 并排时两栏独立裁剪：左栏 detail → 选项窗口，右栏独立裁 preview
- [0005](0005-multi-confirm-row.md) 多选 Enter 只勾选，收题走 `→ Confirm` 行
- [0006](0006-drop-space-toggle.md) 多选只留 Enter 与数字键，去掉 Space
