# 0020 回投状态与聚合

结果分 `done` / `unknown` 两类；blocked 不投递，留在子 pane 等回答；相近完成按 `aggregateWindowMs` 窗口聚合；Esc 在父 pane 只取消父 turn，停子代理靠聚焦其 pane 按 Esc 或关 tab。

依据：避免误读与通知风暴。
