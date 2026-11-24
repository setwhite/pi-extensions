# 0007 零行高界面：角落浮窗 + 底栏一行

**已由 [0008](0008-overlay-on-demand.md) 部分取代**：浮窗改为按需挂载，折叠即释放，不再常驻。

**决定**：

- 删掉 `ctx.ui.setWidget`，不再支持 `ui.widget.placement`（写了直接报错，指向 `ui.mode`）。
- `ui.mode` 默认 `"overlay"`：`ctx.ui.custom` 挂常驻非抢焦点浮窗，`nonCapturing: true`，`visible(termWidth)` 控制显隐。
- 终端窄于 `ui.overlay.minTerminalWidth`（默认 100）时浮窗隐藏，改在底栏写一行。
- `ui.mode: "status"` 只在底栏写一行；`alt+t` 弹只读浮层看整张表。
- `overlay` 档的 `alt+t` 把浮窗压成一行（表头加第一条进行中），不撤窗；再按恢复整表。
- 配置由 `0.3.1` 升到 `0.4.0`。

**为什么**：

1. `setWidget` 挂在输入框上下，直接吃掉对话阅读区的行数。跟输入框、交互弹窗同屏时上下夹扁，视觉也乱。零行高是这个改动的全部目的。
2. 浮窗不抢焦点，`PageUp`/`PageDown` 照常滚屏。表只是「抬头可见」的旁注，不该拿走输入框的键盘。
3. 窄屏兜底不用第二块浮窗，借底栏一行。宿主的 footer 不动，所以别的扩展换 footer 也不冲突。
4. 默认 `overlay`：`status` 只剩一行时看不到有几件、哪件在做之外的细节，默认档要的是「不翻 transcript 就够用」。用户在 spec 未决里拍的这档。
5. 旧键直接报错而不是静默忽略：placement 没有等价物，静默丢会让人以为配置生效了。

**代价**：

- 依赖宿主支持 `overlayOptions.nonCapturing` 与 `visible`。pi-tui 1.4 / 1.6 都有（见 [research/0001](../research/0001-host-overlay.md)），更老的版本没测。
- 窄屏兜底是一次渲染期副作用：`visible()` 里写 `setStatus`。靠「上次写的文本」去重，多一帧渲染。
- 0.3 的配置直接在 0.4 上报错，用户得改一行配置。
- 真机冒烟还得人看：浮窗位置、焦点、滚屏、缩窄终端。

**没选**：`setFooter` 换整个页脚。那会跟第三方 footer 打架，代价比收益大。
