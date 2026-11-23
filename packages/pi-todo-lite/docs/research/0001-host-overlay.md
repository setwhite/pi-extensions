# 0001 宿主浮窗能力实测

**目的**：动工前确认 `ctx.ui.custom(..., { overlay: true, overlayOptions })` 的 `nonCapturing` 与 `visible(termWidth)` 在本地安装的 Pi 上可用。对应 [SPEC-0002](../specs/0002_zero_height_ui.md) 的「未决」。

**结论**：两个能力都在。`overlay` 档可以落。

## 证据

查的是代码，不是真机帧。

| 能力 | 位置 | 内容 |
|---|---|---|
| `nonCapturing` / `visible` 类型 | `@earendil-works/pi-tui` 的 `dist/tui.d.ts` `OverlayOptions` | `visible?: (termWidth: number, termHeight: number) => boolean`；`nonCapturing?: boolean` |
| 版本覆盖 | 包内 devDependency `1.4.0`，本机全局 `1.6.0` | 两版都有这两个字段，类型不用升依赖 |
| 不抢焦点 | `pi-tui/dist/tui.js` `showOverlay` | `if (!options?.nonCapturing && this.isOverlayVisible(entry)) this.setFocus(component)`；`setHidden(false)` 的回焦同样跳过 |
| 不当捕获层 | 同文件 `getTopmostVisibleOverlay` | 遍历时 `if (overlay.options?.nonCapturing) continue` |
| 按宽度显隐 | 同文件 `isOverlayVisible` | `entry.options.visible(this.terminal.columns, this.terminal.rows)`，每次渲染问一次 |
| 扩展侧透传 | `pi-coding-agent/dist/modes/interactive/interactive-mode.js` `showExtensionCustom` | `overlayOptions` 静态值或函数，原样交给 `showOverlay`；`onHandle` 拿到 `OverlayHandle` |
| 关闭路径 | 同上 | `done()` 时 `overlayHandle?.hide()` 并调 `component.dispose?.()`；`custom()` 返回的 Promise 此时才 resolve |

## 动工口径

- 挂载不 `await`：`session_start` / `restore` 里 `void ctx.ui.custom(...)`，持有工厂给的 `done` 作为关闭句柄。
- 重复挂载先关旧的，再用代号挡住晚到的旧工厂（宿主先调工厂再 `showOverlay`，旧工厂自己 `done()` 后宿主看到 closed 就不挂）。
- `visible()` 在渲染期被调用。窄屏兜底的 `setStatus` 写在这里，靠一份「上次写的文本」去重，避免 `setStatus → requestRender → visible()` 转圈。

## 没做

真机 TUI 冒烟（AC6）：角落位置、焦点不进浮窗、`PageUp`/`PageDown` 照常滚屏、窄屏降级。本环境没有交互终端，留给有终端的机器跑 `pi -ne -e ./packages/pi-todo-lite/src/index.ts`。
