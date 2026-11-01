# 0044 展示只用 name 与任务首行

展示：`name` = tab 标签 = 侧边栏；pane 头 = 任务第一行（为空时用 `name`）；不设 `title` / `display_agent` / `state_labels`；不改 workspace label（初始值见 [契约](../specs/0001-v1-contract.md) §4）。

依据：人只需要记一个名字；`send` 只认 name。
