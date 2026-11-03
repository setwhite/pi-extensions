# session-file

本模块读子 session 与退出回执。本文只写取舍。

## 读尾部

- `unreadable`（文件缺失、权限、目录）与 `empty`（还没有 assistant 消息）是两回事。`empty` 继续等。`unreadable` 与「拿到条目却没有文本」走同一条重试路径，满 3 次才结算 `no_result`（限从未投递过结果的 run）。`send` 对 `unreadable` 返回 `session_unreadable`，不重启。
- 读文件失败一律折成 `unreadable`，不猜原因。只有解析失败的行被跳过。
- session 文件大于尾部窗口时先读窗口。窗口里没有 assistant 消息再读全文。取舍：轮询路径避免每次读整份 JSONL，正确性靠全文回退保底。
- 快照带 `size`：读取时文件的字节数，读不到为 -1。session 只追加，所以它是尾部的身份。父侧用它判断「这一 turn 投递过没有」（DEC-0060），不另做 stat。

## 退出回执

- 回执在 run 基名上：`<runBase>.exit`。子进程用自己 session 文件的主名拼同一个前缀（DEC-0053），不传环境变量。
- 坏回执当作缺失，不猜原因。
- 其它读错误（如 EACCES）上抛，不当作缺失。真实的 I/O 问题不能被说成「没走过 shutdown」。
