# 决策

当前设计：一个工具 `todo(tasks)`，整表替换。状态三态 `pending` / `in_progress` / `completed`。表显示在输入框上方。代码见 [ARCHITECTURE](../ARCHITECTURE.md)。

每条说清三件事：定成什么、为什么、代价。要推翻哪条，先看这里的理由。推翻要连带改 [SPEC-0001](../specs/0001-pi-todo-lite.md)。

一条一文件。编号即顺序。改其中一条时新开一条，并在旧条注明取代关系。正文引用写 `DEC-0001`。术语见 [GLOSSARY](../GLOSSARY.md)。

- [0001](0001-whole-table-snapshot.md) 单工具整表快照，不用 action + id
- [0002](0002-state-only-own-ledger.md) 状态只写自己的账，不写 toolResult details
- [0003](0003-no-nudge.md) 不做 nudge（收尾提醒）
- [0004](0004-config-read-only.md) 配置：只读、坏配置抛错、越界 clamp
- [0005](0005-auto-clear-clears-ledger.md) 自动清空：清显示要连账一起清
- [0006](0006-clear-on-input.md) clear 在用户发下一条消息时触发，并成为默认档
