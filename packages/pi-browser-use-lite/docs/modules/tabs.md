# tabs

`browser-extension/background/tabs.js`：标签页查询、新建、置前、关闭、分组、导航与等加载、会话标签台账。

## 契约

- 配置值与 sessionKey 全部随命令传进来，扩展侧不留副本。缺了就抛错，不用兜底默认值。
- 一个 sessionKey 一个组。
- 参数用 camelCase：宿主执行器已把 SPEC 的 `init_script`、`timeout_ms` 转好，dispatch（T25）原样转发。

## 取舍

- 入组、写台账或读回失败时关闭新标签再抛错：不留未分组的 Pi 标签。
- `tab.activate` 在后台模式直接抛错，不碰 `chrome.tabs.update`。第一道在宿主（T19），这里是第二道。
- navigate 先挂 `chrome.tabs.onUpdated` 再 `tabs.update`：complete 可能在两步之间到达。更新失败时取消等待，否则超时会变成未处理的 rejection。
- 查 `chrome.tabGroups.query` 判断组是否还在，不用 `tabGroups.get`：`get` 要按错误文案区分「组不存在」，query 没有这条路径。
