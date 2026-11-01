# 0049 bridge 并入主扩展

bridge 不单独入口；主扩展同时注册工具与 `ui_prompt_*` 监听。顶层 `enabled: false` 只跳过工具注册，`bridge.enabled` 独立控制上报。子进程没有 `subagent` 工具时 bridge 仍加载。

依据：pi 的 `--tools` 过滤工具而非扩展；同一入口共享配置，避免第二个入口与 bridge 专用配置模块。
