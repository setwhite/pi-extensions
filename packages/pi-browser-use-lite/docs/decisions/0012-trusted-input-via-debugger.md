# 0012 输入走 chrome.debugger 受信任事件

点击、输入、按键、悬停、拖动、滚动全部走 `chrome.debugger` 的 `Input.dispatchMouseEvent` / `dispatchKeyEvent`。CDP 失败直接报错，不回退到页面内合成事件（[DEC-0007](0007-drop-redundant-pieces.md)）。

例外：文件上传（`background/input/upload.js`）用页面内 `input.click()` 触发文件选择器。理由：标签不可见时 Chrome 丢弃可信输入；文件输入常是 `display:none`，按坐标点击会落空。系统对话框由 `Page.setInterceptFileChooserDialog` 截获，文件由 `DOM.setFileInputFiles` 挂上去。

Considered Options：只用页面内合成事件。代码显著变小，manifest 少一个权限，Chrome 不显示调试横幅。

选 CDP 的理由：合成事件的 `isTrusted` 为 false，通过不了反自动化检测。参考仓库带 44 个反检测挑战页，正是为守这条能力。代价是 `debugger` 权限、Chrome 顶部横幅，以及输入层约 600 行代码。
