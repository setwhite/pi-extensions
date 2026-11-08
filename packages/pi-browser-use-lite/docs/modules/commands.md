# commands

`src/commands/`

## 取舍

- 桥在命令里懒起（`await bridge.start()`）：不碰浏览器的会话不占 17318，也不起 HTTP 服务。代价是多进程时谁先敲 `/chrome` 谁当 server。
- 子命令返回文本，打印由入口的 `ctx.ui.notify` 做：命令层不碰 TUI，测试只看返回的字符串。
- 报错沿用 SPEC 的错误类别名（`extension_missing`、`bad_args`），不为命令另起一套文案。
- `status` 的 target 行来自宿主会话状态，命令不去问扩展：问一次也算发浏览器命令，而 `status` 保证一条都不发。
