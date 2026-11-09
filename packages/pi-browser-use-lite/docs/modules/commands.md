# commands

`src/commands/`

## 取舍

- 桥在命令里懒起（`await bridge.start()`）：不碰浏览器的会话不占 17318，也不起 HTTP 服务。代价是多进程时谁先敲 `/chrome` 谁当 server。
- 子命令返回文本，打印由入口的 `ctx.ui.notify` 做：命令层不碰 TUI，测试只看返回的字符串。
- 报错沿用 SPEC 的错误类别名（`extension_missing`、`bad_args`），不为命令另起一套文案。
- `authorize on` 不查扩展连没连上就授权：扩展按轮询连上来，等它连上再授权会让第一次命令必然失败。没连上时把装扩展的三步加在授权结果后面。
- `status` 的 target 行来自宿主会话状态，命令不去问扩展：问一次也算发浏览器命令，而 `status` 保证一条都不发。
- `authorize on|off` 改完状态后由入口同步活动工具集：`off` 之后五个工具不在模型工具表里，也不在 codemode 描述里。
- 参数补全交给 `getArgumentCompletions`：按整条子命令做前缀匹配，打到 `authorize ` 只剩 on 与 off。补全只读常量表，不问策略，也不问桥。
