# keyboard

## 取舍

- 键位表只覆盖 US 布局。`type` 直接把字符放进 `text`，不模拟 Shift 按下：大小写与符号由字符本身决定，少一半事件。
- 每个键一对事件：keyDown 携带 `text`，随后 `keyUp` 不带 `text` 与 `commands`。页面上的 keyup 监听与快捷键才会触发。
- 快捷键（Ctrl、Alt、Meta）用 `rawKeyDown` 且不带 `text`，否则 `Ctrl+A` 会把 `A` 插进页面。修饰键本身也按下再松开，顺序 Meta、Ctrl、Alt、Shift，松开反过来；修饰位同时写进每个事件。
- `replace` 用 Chrome 的 `selectAll` 编辑命令选中，再发一次 Delete。编辑命令与平台无关，不需要按 Ctrl 还是 Cmd。
- 不 `replace` 时先发 `End`（`moveToEndOfDocument`）把光标移到末尾：点击落在字段中间，不先移就会把文本插进正文，而 SPEC-0001 说 `type` 是追加。焦点不在可编辑元素上（比如焦点在 iframe 编辑器里）就不挪光标，按键照发，避免为一次输入滚动整页。
- `contenteditable` 走一次 `Input.insertText`：富文本编辑器按字符渲染会丢字符或错序。
- `fill` 是逐字段「点击聚焦 → 整体替换」。字段收 selector 或坐标；带 ref 的字段由 dispatch 挂一个 `locate`，在点击前才换成坐标（解析会滚动页面）。没有 `locate` 的字段先整体校验，避免填一半才报错。
- 键位表外的键名对 `press` 是 `bad_args`：猜一个键码发出去，页面收到的就是另一个键。表外的字符对 `type` 合法，只带 `text` 让 Chrome 插入。
