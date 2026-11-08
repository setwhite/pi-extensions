# target

`browser-extension/background/target.js`

## 取舍

- 台账写 `storage.session` 与 `storage.local` 两处，读的时候先 session 再 local：session 随扩展重载与浏览器重启清空，local 留着，所以要读回上一次的 target 只能靠 local。反过来说 local 里的记录可能已经很旧。
- 认「这是本会话的 target」要 id 与组归属同时对上：浏览器重启后标签 id 会被重用，只认 id 会把用户自己的标签当成自动化 target 关掉。代价是用户把 target 拖出组、或组被删掉以后，本会话就报 `no_target`，等下一次 `chrome_act navigate` 重建。
- 顺手建 target 的动作只有 `page.navigate`。SPEC 的 `no_target` hint 只点 navigate 与 `chrome_tab new` 两条路，而 tab.new 是显式要新标签，走 `createTarget`，不经过「有没有 target」的判断。
- 台账只记本会话自己建的标签，所以清理不会碰到用户自己加进组里的标签。`closeOwnTabs` 由宿主按 `policy.closeOwnTabsOnExit` 传：为 false 时只清台账，标签留着。
- 会话结束时的调用点在宿主：`session_shutdown` 里发 `automation.cleanup`，`dispatch` 原样交给 `cleanupAutomation`。
