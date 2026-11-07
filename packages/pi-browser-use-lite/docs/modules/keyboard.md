# keyboard

## 取舍

- 键位表只覆盖 US 布局。`type` 直接把字符放进 `text`，不模拟 Shift 按下：大小写与符号由字符本身决定，少一半事件。
- 每个键一个事件：只发携带 `text` 的 keyDown，不配对 keyUp。代价是页面上的 keyup 监听收不到事件；要换来的是逐字符路径的事件数与按键数一一对应。
- 快捷键（Ctrl、Alt、Meta）用 `rawKeyDown` 且不带 `text`，否则 `Ctrl+A` 会把 `A` 插进页面。组合键不单独按修饰键，修饰位放在事件里。
- `replace` 用 Chrome 的 `selectAll` 编辑命令选中，再发一次 Delete。编辑命令与平台无关，不需要按 Ctrl 还是 Cmd。
- `contenteditable` 走一次 `Input.insertText`：富文本编辑器按字符渲染会丢字符或错序。
- `fill` 是逐字段「点击聚焦 → 整体替换」。字段先整体校验，避免填一半才报错。
- 键位表外的键名对 `press` 是 `bad_args`：猜一个键码发出去，页面收到的就是另一个键。表外的字符对 `type` 合法，只带 `text` 让 Chrome 插入。
