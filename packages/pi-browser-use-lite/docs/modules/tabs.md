# tabs

`browser-extension/background/tabs.js`

## 契约

- 配置值与 sessionKey 全部随命令传进来，扩展侧不留副本。缺了就抛错，不用兜底默认值。
- 一个 sessionKey 一个窗口，窗口 id 记在台账里。
- 窗口被用户关掉后，下一次 `tab.new` 重开一个，台账改记新窗口。
- `tab.list` 只列本会话窗口里的标签。
- 参数用 camelCase：宿主执行器已把 SPEC 的 `init_script`、`timeout_ms` 转好，dispatch 原样转发。

## 取舍

- 窗口用 `focused: false` 建，不抢用户的前台。
- 窗口刚建时用它自带的那个标签，不再多建一个空标签。建窗口不带 url：Vivaldi 的 `chrome.windows.create({ url })` 承诺不 resolve，命令会一直挂着直到服务工作进程被回收。窗口建成空页之后再用 `chrome.tabs.update` 导航。
- `tab.activate` 在后台模式直接抛错，不碰 `chrome.tabs.update`。第一道在宿主（T19），这里是第二道。
- `tab.activate` 之后再 `chrome.windows.update({ focused: true })`：切标签的意图是让人看见；只激活标签而不亮窗口，页面仍是 `hidden`，可信输入会被丢弃。
- navigate 先挂 `chrome.tabs.onUpdated` 再 `tabs.update`：complete 可能在两步之间到达。更新失败时取消等待，否则超时会变成未处理的 rejection。
