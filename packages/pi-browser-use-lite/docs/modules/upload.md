# upload

`browser-extension/background/input/upload.js`

## 取舍

- 触发点击用页面内 `input.click()` 加 CDP 的 `userGesture`，不走可信鼠标（DEC-0012 的例外）：文件输入常是 `display:none`，按坐标点击会落空；标签不可见时按坐标点击还会被 Chrome 丢弃。
- 只认页面里第一个 `input[type=file]`。SPEC-0001 的 `upload` 只有 `paths`，没有定位参数；等有按元素上传的需求再进工具面。
- 等 chooser 的 promise 只 resolve，超时作为 `{ timedOut: true }` 返回：触发点击先抛错时没有人 await 它，reject 会变成未处理的 rejection。
- 每次调用挂一个 `chrome.debugger.onEvent` 监听，按 `source.tabId` 过滤，`finally` 里摘掉：跨调用不串台，标签关掉也不留监听。
- 关拦截失败会盖掉原错误，照抛：拦截残留会让同标签的下一次上传静默卡住，宁可暴露。
