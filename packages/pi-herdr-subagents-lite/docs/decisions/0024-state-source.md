# 0024 状态只读 herdr

状态只读 herdr：`agent list` 的 `agent_status` 与 `completion_seq`。父侧只保留 run 记录与每个 run 最近一次 `completion_seq`，不复制 working/blocked/done 状态机。

依据：`completion_seq` 与谁看过无关。
