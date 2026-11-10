# 决策

当前设计：5 个 `chrome_*` 分派器工具。Pi 扩展在 `127.0.0.1` 上起本地桥，配套 Chrome 扩展轮询它，用 `chrome.debugger` 执行命令。输入走受信任的 CDP 事件。工具默认注册为不活动，`/chrome authorize on` 后才进模型可见面。代码见 [ARCHITECTURE](../ARCHITECTURE.md)。

一条决策一份文件。文件名前缀就是编号（`0013` → [0013-structured-result-error.md](0013-structured-result-error.md)）。正文引用写 `DEC-0013`。契约见 [SPEC-0001](../specs/0001-tool-surface.md)。外部实测见 [research](../research/)。

## 底本与工具面

| # | 决策 |
|---|---|
| [0010](0010-pi-chrome-as-base.md) | 以 pi-chrome 为底本删减 |
| [0011](0011-fixed-tool-surface.md) | 工具面固定为 5 个 |
| [0009](0009-tool-switches-and-prompts.md) | 工具开关与可配置提示词 |
| [0006](0006-config-boundary.md) | 配置只覆盖会改的旋钮 |
| [0005](0005-authorize-toggle.md) | 授权改成开关 |
| [0007](0007-drop-redundant-pieces.md) | 删掉过度设计 |

## 桥与扩展

| # | 决策 |
|---|---|
| [0003](0003-bridge-multi-session.md) | 本地桥保留多会话共享 |
| [0015](0015-split-bridge.md) | 拆 bridge |
| [0004](0004-extension-es-module.md) | Chrome 扩展用 ES module service worker |

## 输入与结果

| # | 决策 |
|---|---|
| [0012](0012-trusted-input-via-debugger.md) | 输入走 chrome.debugger 受信任事件 |
| [0013](0013-structured-result-error.md) | 结果信封带结构化错误类别 |

## 仓库

| # | 决策 |
|---|---|
| [0001](0001-follow-sibling-conventions.md) | 工程与配置对齐同仓库其他包 |
| [0002](0002-reference-repos-stay.md) | 参考仓库留在包内 `_repos/` |
| [0008](0008-license.md) | 许可证与作者 |
