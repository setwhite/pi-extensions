# 0012 输入走 chrome.debugger 受信任事件

点击、输入、按键、悬停、拖动、滚动全部走 `chrome.debugger` 的 `Input.dispatchMouseEvent` / `dispatchKeyEvent`。CDP 失败直接报错，不回退到页面内合成事件（[DEC-0007](0007-drop-redundant-pieces.md)）。

例外：文件上传（`background/input/upload.js`）用页面内 `input.click()` 触发文件选择器。理由：标签不可见时 Chrome 丢弃可信输入；文件输入常是 `display:none`，按坐标点击会落空。系统对话框由 `Page.setInterceptFileChooserDialog` 截获，文件由 `DOM.setFileInputFiles` 挂上去。

Considered Options：只用页面内合成事件。代码显著变小，manifest 少一个权限，Chrome 不显示调试横幅。

选 CDP 的理由：合成事件的 `isTrusted` 为 false，通过不了反自动化检测。参考仓库带 44 个反检测挑战页，正是为守这条能力。代价是 `debugger` 权限、Chrome 顶部横幅，以及输入层约 600 行代码。

## 附录：不可见页面用焦点模拟

输入前探测 `document.visibilityState`。不可见就发 `Emulation.setFocusEmulationEnabled { enabled: true }`：页面自报 `visible`、`hasFocus()` 为 true，Chrome 接受 CDP 输入，且不激活标签、不抢用户前台。等 6×50ms 仍不可见才报 `page_error`。

这个设置随调试器会话存在，`releaseAll()` 或重连后下一次输入会自动补发。它不改变 `isTrusted`，CDP 输入仍是可信事件。读操作（eval、快照、截图）不主动开模拟；输入开过之后，它们看到的就是模拟后的 `visible`。
