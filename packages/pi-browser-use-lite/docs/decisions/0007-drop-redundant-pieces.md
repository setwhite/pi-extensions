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

## 留了什么

`chrome_cdp` 保留。它是 5 个工具里最少用的一个，但拦网络请求、改设备模拟这类事只有它做。

## 连带影响

页面注入文件从 3 个降到 2 个。命令从 5 个降到 3 个。内部动作从 6 个降到 2 个。

配置：删 `input.domFallback` 与 `screenshot.retentionDays`，加 `screenshot.format` 与 `policy.closeOwnTabsOnExit`。最终 15 个标量加 `tools`、`guidance` 两个记录。

工具仍 5 个。`chrome_act` 的动作 13 个降到 12 个，`chrome_tab` 6 个降到 5 个，`chrome_vision` 的专有参数 4 个降到 1 个（另有公共 `tab`）。
