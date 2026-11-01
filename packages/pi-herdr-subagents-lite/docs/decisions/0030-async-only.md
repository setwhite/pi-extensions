# 0030 只做异步交付

只做异步交付，没有同步模式，没有 wait；`run` 立即返回 `{state:"running", name, paneId, sessionFile}`；结果消息开启新 turn。

依据：异步消息是唯一结果通道。
