# 0046 角色只看 inbox 目录

不用环境变量 marker、loadout、进程探测；本进程是不是子代理只看 `<sessionFile>.inbox/` 是否存在。全局安装后子进程也加载本包；profile 不写 `tools` 时启动参数带 `--exclude-tools <toolName>`，子进程默认没有本工具（`--tools -<toolName>` 只改默认集，扩展注册的工具仍可用）；写了 `tools` 才按它决定。嵌套要在 profile 的 `tools` 里显式写上工具名，不做深度管理。

依据：用户选择；目录已存在，不需要额外状态；fork 后保留 `subagent` 工具时这条信号仍成立。
