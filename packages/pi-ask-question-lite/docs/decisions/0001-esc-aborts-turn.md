# 0001 Esc 整次中止：`ctx.abort()` 加 `terminate: true`

## 决定

Esc → 调 `ctx.abort()`，工具结果带 `terminate: true`，`details.answers` 清空，`aborted: true`。

## 为什么

实测三条路径（见 [research 0001](../research/0001-abort-on-esc.md)）：

- 只 `ctx.abort()`：宿主还会再发一次 provider 请求等它被信号打断，UI 显示 Operation aborted。
- 只 `terminate: true`：同批还有别的工具时批终止不成立，模型会再问一轮。
- 两个一起：1 次 provider 请求，本轮直接结束。

半成品答案只从 `keys.submitEarly` 一条路出去。Esc 若也带回部分答案，「取消」就变成「部分提交」，两种语义会在同一个键上打架。

## 代价

- 会话里留一条工具结果，下一轮模型看得到。文案必须写清「用户整次放弃，不要原样重问」。
- 多工具同批时，未开始的同批工具被取消。宿主行为，绕不开。
- 依赖 `terminate` 与 `ctx.abort()` 的当前语义。宿主改 agent loop 要重跑 research 里的 probe。
