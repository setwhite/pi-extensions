# 0005 授权改成开关

## 问题

`/chrome authorize` 要不要接受时长。

## 选项

1. `on` 与 `off`。状态用 `/chrome status` 查。授权只在会话内有效。
2. 保留原版语法：`15m`、`30m`、分钟数、`indefinite`。

## 选了

1。

## 理由

时长语法养着三处代码：`parseAuthorizeArg` 解析、`scheduleAuthExpiry` 定时器、`startCountdownTicker` 倒计时渲染（pi-chrome `index.ts:1295`、`1019`、`1090`）。状态类型是 `number | "indefinite"`，渗进 8 处判断。改成布尔后约删 80 行。

同一决定里删掉 TUI 状态栏。`appendEntry` 与 `registerEntryRenderer` 一起去掉：没有渲染器的 `appendEntry` 在 TUI 里显示原始 JSON。审计改由 `/chrome status` 承担。

代价：翻旧对话看不到授权时间点。接受。

`policy.authorizeOnStart` 为 `true` 时启动即授权，不必每次敲命令。

开关同时决定工具可不可见：工具注册为不活动，`on` 挂进活动集，`off` 摘掉，模型工具表与 codemode 描述一起变。授权判定仍是第二道门，见 [policy](../modules/policy.md)。

`authorize on` 曾经要求桥先报 `connected` 才授权。扩展按轮询连上来，命令在 `bridge.start()` 之后立刻查台账，那一刻还没连上，所以第一次授权必失败、第二次才成功。授权是用户的意图，与传输状态无关，于是改成先授权再报连接状态；没连上时把装扩展的三步一起打印。

现在连「报连接状态」也不再由授权命令做：桥在 `session_start` 起，授权只改策略，连接与装扩展的三步只由 `/chrome status` 报。第一次授权和第一次工具调用都不再和扩展的首次轮询抢跑。
