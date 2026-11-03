# 0061 模型面不带 session 路径

`run` 与 `send` 的工具结果 `content` 只回 `{state, name}`。`paneId` 与 `sessionFile` 留在 `details`。`unknown` 结果消息不带 `Session file:`。`send` 的错误只报子代理名，不报路径。

## 为什么

子代理的价值是隔离上下文。父模型拿到 session 路径就会去读子会话正文，两个上下文的边界没了。四个暴露面指向同一个 sessions 目录：拿到任一个就能列出并读取全部子会话。

模型对这两个字段也没有动作可做：`send` 认 `name`，pane 由 herdr 管。工具 schema 里没有 pane 或 session 参数。

## 保留的两处

- `spawn_failed` 仍给 pane id（`A pane was created: w1:p4.`）。人靠它找到卡住的 pane，它不是 session 路径。
- 超长结果仍给 `Full result:` 路径。那是结果正文的唯一位置，且该目录只放 run 文件，没有 session（[DEC-0053](0053-session-dir.md)）。

## 否决的替代

- 只删 `Session file:` 行，留下 `run` 结果里的 `sessionFile`。一次 `run` 就够模型顺着目录读到全部子会话。
- 把 session 藏到哈希路径。目录照样能列，压住的只是可读性。
- 在文案里劝模型别读。约束不落在机制上。
