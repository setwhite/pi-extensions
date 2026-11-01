# 0032 died 判定以 agent list 消失为准

判死规则已被 [DEC-0052](0052-completion-snapshot.md) 取代：现在只认退出回执与 pane 消失。仍有效的部分：单次命令失败不算死亡；`agent explain` 只作人工诊断；不用 `agent wait`。

依据：父侧已有轮询快照；不额外造等待进程。

## 修订：消失不是判死依据

「不在列表里」只是这一拍的观测，herdr 的 agent 登记在 pane 启动初期会短暂缺失。判死改为只认事实：有退出回执，或 pane 不在 `pane list` 里；两者都没有时只给一段租约。见 [DEC-0052](0052-completion-snapshot.md) 的「修订：死亡只认事实」。
