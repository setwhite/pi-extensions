# 0033 不依赖 pane.report_metadata

不依赖 `pane.report_metadata` 做恢复；不设 `title` / tokens；server 重启会丢；tab / pane label 保留。

依据：实测：重启后 metadata 消失。
