- [ ] 未开始
- Spec: docs/specs/0001-pi-ask-lite.md
- 验收: AC8

## 交付物

- 真机记录写进本文件：herdr 面板变红与恢复、单 Esc 回空闲且无第二次模型回复、`e` 就地补充（单选一条、多选每个选项各一条，取消勾选即清掉）、多选 Enter 勾选后走 `→ Confirm` 收题、`ctrl+]` 折叠与展开、preview 并排切堆叠、Ctrl+Enter 提前提交、聊天记录只有一行调用与每题一行结果、Ctrl+O 展开成完整题干加逐条选项
- 跑出来的偏差写回 spec 的「已知偏差」，或新开决策

## 前置

- [0001](0001-pi-ask-lite.md) 完成，`pnpm check` 绿

## 实测记录

### 2026-11-25 herdr 变红（部分）

- 环境：herdr 0.9.5，隔离 tab `w31:tB` / pane `w31:pC`，`pi -e packages/pi-ask-lite/src/index.ts`（不带 `-ne`）。
- 扩展列表里同时有 `herdr-agent-state.ts` 与 pi-ask-lite。原先 AC8 的 `-ne` 命令关掉了扩展发现，状态扩展不加载，所以永远验不红（DEC-0009）。
- 弹窗期间 `herdr agent get askprobe` 为 `blocked`；按 `1` 后 `working` → `done`，聊天出 `✓ Choose: A`；再跑一轮按 `esc` 后 `done`，聊天出 `✗ aborted`，没有第二次模型回复。
- 未覆盖：`e` 补充、多选 `→ Confirm`、`ctrl+]` 折叠、preview 并排切堆叠、Ctrl+Enter、Ctrl+O 展开。
