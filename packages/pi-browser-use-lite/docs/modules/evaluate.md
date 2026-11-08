# evaluate

`browser-extension/background/page/evaluate.js`

## 取舍

- 任意源码只走 CDP `Runtime.evaluate`：`chrome.scripting` 的 `func` 形式要的是函数对象，页面里再 `new Function` 会被 `script-src` 挡掉，而 `Runtime.evaluate` 不受页面 CSP 约束。
- 每次求值前重新注入辅助函数：导航会清掉页面全局。
- 表达式形式优先，页面报 `SyntaxError` 时改按语句体求值。语句体要自己写 `return`，否则结果是 `undefined`。
- 超长的 `data` 省掉：多是 base64 图片，会把调用体积顶爆。省掉的字符数写进 `note`，宿主把它接在正文末尾。
