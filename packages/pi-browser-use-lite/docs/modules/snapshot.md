# snapshot

`browser-extension/background/page/snapshot.js` 与 `browser-extension/page/snapshot.js`

## 取舍

- 采集与裁剪分家：页面脚本一次采全部可见数据，4 个模式共用这一份；模式裁剪、diff 与上限都在包装层，脱离浏览器可测。
- 基线按标签存 `storage.session`，每次快照都写，所以换模式不丢基线。
- `maxElements` 与 `textChars` 由宿主传入，扩展侧不留第二份默认值；`full` 的正文上限是 SPEC-0001 的常量。
- ref 只在页面存活期间有效，导航后失效。`inspect` 按 ref 或 selector 找回元素，ref 优先。元素已经被换掉（`isConnected` 为假）时直接报 stale，不拿 (0,0) 去点：旧坐标落在别的元素上，静默点下去就是错的动作。每次采集顺手清掉这些 ref，map 不随页面改版长胖。
- 指针动作不收 ref：`elementAt` 把它换成元素中心的坐标，坐标算在快照层，因为 rect 只在快照里有。rect 是视口坐标，所以指针动作传 `scroll`：元素不完全在视口里时先滚到视口中心，否则点到的坐标落在视口外。已经看得见就不滚，避免把页面滚动变成副作用。`chrome_see` 的深查不传 `scroll`，读页面不改变滚动位置。
- 标签关闭时删掉该标签的基线键。
- `markBaseline` 与 `changesSince` 是 diff 的两个半步，给 dispatch 在改元素的动作前后各调一次；包装层不替它们拍快照。
- 注入先用 `chrome.scripting`；被权限拒绝就由调试器通道送同一份源码，与求值路径的回退一致。
