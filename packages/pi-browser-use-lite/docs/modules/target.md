# target

`browser-extension/background/target.js`

## 取舍

- 台账写 `storage.session` 与 `storage.local` 两处，读的时候先 session 再 local：session 随扩展重载与浏览器重启清空，local 留着，所以要读回上一次的 target 只能靠 local。反过来说 local 里的记录可能已经很旧。
- 认「这是本会话的 target」要两条同时成立：id 在台账里，且它在本会话的窗口里（窗口台账见 `tabs.js`）。
- 浏览器启动时 `background/index.js` 把整份台账作废：标签 id 与窗口 id 都会被重新分配，跨启动的旧 id 下次可能落在用户的标签上。作废挂在 `chrome.runtime.onStartup`，扩展重载不触发，所以热重载后还能接着用原来的 target。
- 建 target 只建空标签，不带 url：`page.navigate` 自己用 `navigateTab` 加载页面，init script 因此在唯一那次加载之前注册好。
- 顺手建 target 的动作只有 `page.navigate`。SPEC 的 `no_target` hint 只点 navigate 与 `chrome_tab new` 两条路，而 tab.new 是显式要新标签，走 `createTarget`，不经过「有没有 target」的判断。
- 台账只记本会话自己建的标签，所以清理不会碰到用户的标签。`closeOwnTabs` 由宿主按 `policy.closeOwnTabsOnExit` 传：为 false 时只清台账，标签留着。
- 台账还兼作「哪些标签是我们建的」的答案：`trackedTabIds()` 供日志抓取筛选，别把调试器挂到用户自己的标签上。
- 会话结束时的调用点在宿主：`session_shutdown` 里发 `automation.cleanup`，`dispatch` 原样交给 `cleanupAutomation`。
