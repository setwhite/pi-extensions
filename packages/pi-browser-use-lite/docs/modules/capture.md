# capture

`browser-extension/background/capture.js`

## 取舍

- 走 CDP 事件流而不是页面包装：缓冲区必须跨同标签导航存活，页面里的变量随导航销毁，要靠它就得再加一层 content script 把记录搬出来。`Runtime.enable` 与 `Network.enable` 走已有的调试器通道，页面里一行代码都不插。
- 挂调试器分两个时机：`onCommitted` 管别的来源发起的导航（含点链接），dispatch 在动作之前再补一次，所以本扩展发起的导航从请求那一刻起就抓。幂等在 `startCapture` 内部用「开过了就不重开域」保证。
- 只抓台账里的标签（`target.trackedTabIds()`）：`onCommitted` 对所有标签都会触发，不设这道闸就会给用户自己的标签挂调试器、弹「正在调试」提示条。
- 缓冲区与在途请求的起点时间都写 `storage.session`：service worker 被回收后记录还在，跨回收完成的请求也算得出耗时。调试器事件可能在 `startCapture` 之前到（worker 刚被唤醒），所以事件处理先按标签建缓冲区，不丢事件。
- 挂不上调试器不抛错：导航与动作照常，抓取关闭的原因由 `logs` 头部带回。调试器被摘掉也走同一条路。
- 请求体在事件里就截断，响应体只在 `request_id` 单条详情时才去取：取不到就把原因写进那条记录，不打断读取。
