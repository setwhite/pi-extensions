# tabs

`browser-extension/background/tabs.js`

## 契约

- 配置值与 sessionKey 全部随命令传进来，扩展侧不留副本。缺了就抛错，不用兜底默认值。
- 一个 sessionKey 一个窗口，窗口 id 记在台账里。
- 窗口被用户关掉后，下一次 `tab.new` 重开一个，台账改记新窗口。
- `tab.list` 只列本会话窗口里的标签。
- 参数用 camelCase：宿主执行器已把 SPEC-0001 的 `init_script`、`timeout_ms` 转好，dispatch 原样转发。

## 取舍

- 窗口用 `focused: false` 建，不抢用户的前台。新标签在自己的窗口里永远是活动标签（`active: true`）：激活标签不改窗口焦点；不可见的标签默认收不到可信输入，输入前还要开焦点模拟。
- 窗口刚建时用它自带的那个标签，不再多建一个空标签。建窗口不带 url：Vivaldi 的 `chrome.windows.create({ url })` 承诺不 resolve，命令会一直挂着直到服务工作进程被回收。窗口建成空页之后再用 `chrome.tabs.update` 导航。
- `tab.activate` 是「让我看见」：先激活标签，再把窗口带到前台。输入不再走这两个调用：不可见时开焦点模拟，见 [pointer.md](./pointer.md)。
- `tab.activate` 之后再 `chrome.windows.update({ focused: true })`：只激活标签不亮窗口，被别的窗口盖住时页面仍是 `hidden`，用户看不到。窗口没被盖住时，只激活标签就够了。
- navigate 先挂 `chrome.tabs.onUpdated` 再 `tabs.update`：complete 可能在两步之间到达。更新失败时取消等待，否则超时会变成未处理的 rejection。
