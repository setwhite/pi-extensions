# dispatch

`browser-extension/background/dispatch.js`

## 取舍

- target 解析在 `dispatch` 里做一步，不进 21 个处理函数：只有「命令作用在哪个标签」这一件事需要会话信息，其它参数原样转发。
- 拿到标签后先开日志抓取：这样本扩展发起的导航从发命令那一刻就在抓，页头最早执行的脚本也不漏，不必等 `onCommitted`。
- 哪些动作算「改了页面」由代码里的 `CHANGED_ACTIONS` 定，这一层只负责在动作前后各拍一次快照；两边各写一遍名单只会漂。
- `ref` 换成坐标也在这一层：指针层只认 `selector` 或 `x`+`y`，rect 只有快照拿得到。
- 报错原样上抛，不包 `{ ok: false }`：信封归 `transport.js`，分类归宿主的 `classify()`。这一层只保留 `<class>: ` 前缀。
