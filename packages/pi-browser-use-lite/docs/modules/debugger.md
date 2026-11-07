# debugger

`browser-extension/background/input/debugger.js`：挂调试器、发原始 CDP、scripting 回退。

## 取舍

- attach 缓存只存标签 id。标签 id 在浏览器会话内唯一，不持有 tab 对象。
- 会话失效有两种文案：`Detached` 与 `Debugger is not attached`。两者都自愈。顺序：清缓存 → detach 残留 → 重挂 → 原命令重试一次。第二次仍失败就上抛。
- detach 的「not attached」错误可以吞：残留条目可能已经不在。其它 detach 错误照抛。
- 不激活标签。`chrome.debugger` 不可用时抛错，不回退到 `chrome.tabs.update({ active: true })`。
- scripting 回退固定落在 MAIN world。调用方传 `ISOLATED` 时，回退后的语义不同。
- 回退只支持 `func` + `args`，不支持 `files` 注入。
- `args` 走 JSON 序列化：`undefined` 与函数变成 `null`，循环引用抛 `args must be JSON-serializable`。
