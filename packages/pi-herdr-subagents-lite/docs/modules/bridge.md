# bridge

同一扩展内的监听器，没有单独入口，也不依赖 session（DEC-0049）。本文只写取舍。

- 事件映射与 `label` 取值见契约 §7；本文只留取舍。
- `blockedOn` 是白名单：不是所有 pi 对话框都会挡住子代理，由用户选择哪些算 blocked。
- 不合并嵌套弹窗：每个 start / end 各 emit 一次。嵌套时一个 end 可能提前清除 blocked 状态；换取的是没有深度计数与状态机。
- `bridge.enabled: false` 时不注册监听；顶层 `enabled` 只管工具注册（DEC-0049）。
- 子进程没有 `subagent` 工具也照常上报：bridge 与工具注册互相独立。
