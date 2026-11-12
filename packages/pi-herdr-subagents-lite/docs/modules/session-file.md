# session-file

只回答一个问题：`send` 重启前，子 session 是不是停在未完成的工具调用上。完成判定不在这里（DEC-0062）。

## 读尾部

- 文件大于 1 MiB 时先读尾部窗口。窗口里没有 assistant 消息再读全文。
- 只返回 `pendingToolCall` 与 `unreadable`，不返回文本。
- 读失败一律折成 `unreadable`，不猜原因。只有解析失败的行被跳过。
- 文件缺失由 `send` 先用 `existsSync` 判成 `session_missing`，读不到再报 `session_unreadable`。
