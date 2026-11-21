# snapshot

`browser-extension/background/page/snapshot.js` 与 `browser-extension/page/snapshot.js`

## 取舍

- 采集与裁剪分家：页面脚本一次采全部可见数据，4 个模式共用这一份；模式裁剪、diff 与上限都在包装层，脱离浏览器可测。
- 基线按标签存 `storage.session`，每次快照都写，所以换模式不丢基线。
- `maxElements` 与 `textChars` 由宿主传入，扩展侧不留第二份默认值；`full` 的正文上限是 SPEC-0001 的常量。
- 元素清单的字符预算（`output.refsChars`）不在这里：一行渲染成什么样由宿主的 `format/elementLine` 决定，扩展拿不到成品长度，抄一份拼法只会慢慢走歪。扩展只管条数，字符预算归 `tools/exec/see.ts`。
- 遍历进 open shadow root：组件把内容放在影子树里，不进去只剩空壳。顺序是宿元素 → 影子树 → light 子树，先序遍历，ref 编号跟着这个顺序。关闭的 root 读出来是 `null`，静默跳过：报告「这里有内容但读不到」只能靠猜。
- shadow root 里的元素只有 ref 这一条路：`document.querySelector` 停在 light tree，`inspect` 的 selector 分支也一样。报错据此点名 `selector matched no element: #reply; shadow DOM content needs a ref from the snapshot`。iframe 是另一个维度，里面的内容仍然进不去。
- 遍历没有节点数上限：`isVisible` 每个节点调一次 `checkVisibility`，组件重的页面耗时随节点数线性增长。
- ref 只在页面存活期间有效，导航后失效。`inspect` 按 ref 或 selector 找回元素，ref 优先。元素已经被换掉（`isConnected` 为假）时直接报 stale，不拿 (0,0) 去点：旧坐标落在别的元素上，静默点下去就是错的动作。每次采集顺手清掉这些 ref，map 不随页面改版长胖。
- 指针动作不收 ref：`elementAt` 把它换成元素中心的坐标，坐标算在快照层，因为 rect 只在快照里有。rect 是视口坐标，所以指针动作传 `scroll`：元素不完全在视口里时先滚到视口中心，否则点到的坐标落在视口外。已经看得见就不滚，避免把页面滚动变成副作用。`chrome_see` 的深查不传 `scroll`，读页面不改变滚动位置。
- 标签关闭时删掉该标签的基线键。
- `markBaseline` 与 `changesSince` 是 diff 的两个半步，给 dispatch 在改元素的动作前后各调一次；包装层不替它们拍快照。
- 注入先用 `chrome.scripting`；被权限拒绝就由调试器通道送同一份源码，与求值路径的回退一致。
