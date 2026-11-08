# transport

`browser-extension/background/transport.js`

## 取舍

- 循环出事就结束，不自己重试：重起交给入口的 1 秒定时器与 alarm，退避策略只有一处。请求失败与超时走同一条路。
- 单次请求 45 秒：桥只挂 25 秒，超过 45 秒说明连接半死（机器睡眠、桥进程被冻住），不会再有应答。
- 拿到命令立刻再问一次，没命令等 100 毫秒：短间隔只用于连发，空闲时的等待在桥那侧。
- 版本不一致先 abort 自己的循环再 `chrome.runtime.reload()`：重载会带走这个循环，不先停就会向后来的自己发请求。
- 重载只做一次，记在 `storage.local` 的 `transport.reloadedFor`：磁盘上仍是旧代码时重载换不来新版本。同一期望版本再来就抛错，让人手动刷新。
- dispatch 抛错也照常回 `ok: false`：宿主按 `class: message` 分类。取走命令却不回结果，只可能是 dispatch 的 Promise 永不 settle。
- 回传结果失败就结束循环：结果送不到，继续轮询只会把队列越积越深。
