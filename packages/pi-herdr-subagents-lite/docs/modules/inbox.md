# inbox

`<childSession>.inbox/` 的唯一读写口；文件协议见契约 §1。本文只写取舍。

## 写

- `enqueue` 先写临时文件再 rename：读方只会看到完整消息，不会读到半截。
- 文件名用进程内单调时间加 UUID，排序即发送顺序。

## 读

- `drain` 按文件名顺序逐条投递，每条投递成功就删除。失败时保留该条并停止本轮：至少一次投递（at-least-once），代价是失败消息可能重复投递。
- 不再归档到 `.delivered/`：原目录只增不减，没有清理策略；代价是无法回看已投递的消息。
- 失败计数与上限不在本模块：[extension](extension.md) 连续 3 拍失败后停泵并通知。

## 轮询成本

- 子进程每 `inboxPollMs` 扫描一次目录，有消息才读文件；每个子进程各扫一份。
- 第一条消息是 `@<childSession>.brief.md`：父侧在 `agent start` 返回后入队，子代理侧扩展的 inbox 泵取到它就起第一轮。inbox 目录必须在 `agent start` 之前就存在，否则子代理侧的泵不会启动。
- 取件没有回执：子代理侧没加载本扩展时它取不到 brief，父侧看到的只是一个一直 idle 的 live run（DEC-0023 修订的已接受代价）。
- 不用 socket 或 IPC：子进程是独立 pi 进程，文件通道避开键盘级的 `agent prompt`（DEC-0026）。轮询成本是这条通道的代价。
