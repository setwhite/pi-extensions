# 0007 删掉过度设计

## 问题

移植 pi-chrome 时，哪些部分不值得搬。

## 选项

1. 全部搬，保持行为一致。
2. 按「有没有场景需要」逐项砍。

## 选了

2。砍 7 项。

## 删了什么

| 删 | 规模 | 理由 |
|---|---|---|
| DOM 假事件回退 | 371 行 | 它发的事件可被风控识别。最需要它的时候正好帮不上。失败直接报错更诚实 |
| 整页截图拼图与 manifest | 约 100 行 | 改 `captureBeyondViewport` 一次拿整页。不引图像库 |
| `/chrome doctor` | 92 行 | 错误消息已分类。诊断命令是重复 |
| `/chrome onboard` | 约 30 行 | 并入 `authorize on` 与 `status` 的未连接分支 |
| `page.probe` 动作 | 1 个 | 只被 `doctor` 用 |
| `input.status`、`input.debug` 动作 | 2 个 | 只为单测存在。测试直接 `import` 模块 |
| `near_ref` 参数 | 约 100 字符 | `query` 已覆盖距离排序的用途 |

## 第二轮：接口面再砍 5 处

| 删 | 规模 | 理由 |
|---|---|---|
| `chrome_vision` 的 `path`、`format`、`quality` | 约 40 行 + 3 个参数 | 落盘路径由模型指定等于让它写任意路径。格式进配置 |
| `chrome_cdp` 的「不给 `method` 就列 target」分支 | 约 30 行 | 一个工具两种返回形状，模型最容易踩。列标签用 `chrome_tab` 的 `list` |
| `chrome_see` 的 `max_elements` 参数 | 1 个参数 | 与 `output.maxElements` 重复 |
| `chrome_act` 的 `tap` | 约 35 行 | 桌面触摸极少用 |
| `chrome_tab` 的 `ungroup` | 约 20 行 | 用户手点一次更快 |

## 第三轮：删掉 background 模式

| 删 | 规模 | 理由 |
|---|---|---|
| `policy.background` 配置键 | 1 个键 | 它管的是「会不会抢前台」，用户要的是「点得动」。默认值让工具开箱不可用，比打扰更糟 |
| `/chrome background on\|off` | 1 个子命令 | 同上。`/chrome authorize` 已经是「允许它动浏览器」的闸 |
| `FOCUS_ACTION` 与 `FOCUS_BLOCKED` | 约 30 行加一个错误分支 | 用动作名黑名单表达「能不能聚焦」。聚焦还会发生在建标签、重建 target、输入前自救三处，黑名单必然漏 |
| 宿主三处写死的 `background` | 3 处 | 各自猜策略，改一处漏一处 |
| `newTab`、`createTarget`、`activateTab` 的 `background` 参数 | 3 个参数 | 新标签是否活动不是聚焦问题：`active: true` 不改变窗口焦点 |

改成：输入前探测可见性，不可见就激活标签、把窗口带到前台，仍不可见才报错并说原因。读操作不打扰，只有真点击与打字才可能抢前台。

这条提窗自救已被 [DEC-0012](0012-trusted-input-via-debugger.md) 的焦点模拟取代：现在不可见时发 `Emulation.setFocusEmulationEnabled`，不激活标签、不抢前台。原文保留为当时的决策记录。

## 留了什么

`chrome_cdp` 保留。它是 5 个工具里最少用的一个，但拦网络请求、改设备模拟这类事只有它做。

## 连带影响

页面注入文件从 3 个降到 2 个。命令从 5 个降到 3 个。内部动作从 6 个降到 2 个。

配置：删 `input.domFallback` 与 `screenshot.retentionDays`，加 `screenshot.format` 与 `policy.closeOwnTabsOnExit`。第三轮再删 `policy.background`，最终 11 个标量加 `tools`、`guidance` 两个记录。

工具仍 5 个。`chrome_act` 的动作 13 个降到 12 个，`chrome_tab` 6 个降到 5 个，`chrome_vision` 的专有参数 4 个降到 1 个（另有公共 `tab`）。
