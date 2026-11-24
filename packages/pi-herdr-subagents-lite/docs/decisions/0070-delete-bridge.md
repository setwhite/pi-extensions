# 0070 删掉 bridge

删掉 `bridge` 模块、`bridge` 配置键与 `herdr:blocked` 的上报。本包不再监听 `ui_prompt_*`。取代 DEC-0040 与 DEC-0049。

## 为什么

pi 的 `withUIPrompt` 按「调了 `ctx.ui`」发事件，不按「挡住用户」发：`custom` 一进 `withUIPrompt` 就发 `ui_prompt_start`，不看 `overlayOptions.nonCapturing`。装饰用的非捕获 overlay（`pi-todo-lite` 的任务表）在会话启动时挂上，一直不结束。

链路实测：`session_start` 后 113ms 出现 `ui_prompt_start {kind: "custom"}`，没有对应的 `ui_prompt_end`；bridge 把它翻成 `herdr:blocked`，herdr 的 pi 集成把整个 pane 报成 `blocked`。pane、tab、workspace 从 pi 启动挂到退出都是红的，`herdr agent start` 还以 `agent_not_ready` 拒绝这种 pane。

herdr 的 `blocked` 是「认出了等用户回答的界面」。`ui_prompt_*` 表达不了这个：它覆盖所有 `ctx.ui` 调用，装饰 overlay 与模态对话框在事件里长得一样，只有 `kind` 和可选的 `title`。

## 规则

- 谁开模态对话框，谁 emit `herdr:blocked`。这类扩展知道自己挡住了用户，也知道什么时候放开。
- 本包只读 `agent_status`（DEC-0024），不推断、不上报。
- `bridge` 从配置键里消失。老配置写它 = 未知键 = 加载失败（DEC-0037 的严格校验）。

## 代价

- 破坏性：`bridge` 配置键失效，升级后要删掉它。升 minor（0.11.0）。
- 只装本包时，子代理弹对话框不再让 pane 变红，父代理也不会把它当 blocked 排队。要这个行为，得装会 emit 的交互扩展。

## 否决的替代

- bridge 里把 `custom` 从 `blockedOn` 默认值里去掉。真的 `custom` 对话框（ask 类扩展）也就不上报了，等于换一个错。
- 按有没有 `title` 过滤。真对话框不一定带 title，装饰 overlay 也可以带。
- 等 pi 核心给 `ui_prompt_start` 加 `blocking` 字段。要等发版，且本包不该赌上游的事件语义。
