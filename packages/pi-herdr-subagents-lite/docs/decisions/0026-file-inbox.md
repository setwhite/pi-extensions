# 0026 send 走文件 inbox

`send` 走文件 inbox；working 时 steer，idle 时新 turn，blocked 时排队；`agent prompt` 只作人工插话。

依据：`agent prompt` 是键盘级通道，会与人的草稿混合。

## 修订：brief 也走 inbox，代码不再调 `agent prompt`

任务 brief 是父 → 子的第一条文本，走同一条 inbox。于是 `src/herdr/agent.ts` 里只剩 `agent start`，`agent prompt` 从代码中消失（人手在 pane 里插话仍可用它）。

依据：一条通道一个投递保证。`agent prompt` 不返回回执，Enter 可能被 mention 补全吞掉：2026-10-31 domain-5 的 brief 就这样留在输入框，run 却记为 live，父侧无从发现。inbox 是 at-least-once，失败保留原文件，重试语义已有测试覆盖。

代价：子代理侧必须加载本扩展才有 bridge 取件；首条消息多等 ≤`inboxPollMs`。
