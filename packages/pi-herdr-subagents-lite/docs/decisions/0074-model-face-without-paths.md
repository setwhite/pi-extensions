# 0074 模型面只给结果，不给路径

模型面不带 `sessionFile` / `runDir` / `paths.session`，也不带 `paneId`。`src/tool/face.ts` 按白名单投影四个动作的结果：服务层新增字段默认不外泄，要露必须先改白名单。模型面留给父代理的字段：`id`、`status`、`cwd`，有 worktree 时加 `worktree`；结算再加 `summary`、`questions`，以及 summary 被截断时的 `output.md` 路径。子代理自己的 `runDir` / `sessionFile` / `paneId` 在内部照旧使用：`closePane`、`agent.wait` 都靠它们寻址。

## 为什么

拿到路径，父代理就会去读子会话正文：一次几百 KB，顶掉本来要用的上下文，还把它绑在子代理的读序上重跑一遍。更贵的是立场污染——jsonl 里是子代理的中间态与计划，父代理容易把未落实的计划当结论转述。

`session.jsonl` 是日志，不是接口：格式随宿主会话模型演进，父代理一旦依赖它，格式一变不会报错，只会安静地读到半截并当成完整。

模型对这两个字段也没有动作可做：`steer` / `stop` 认 `id`，pane 由 herdr 管，工具 schema 里没有任何 session 或目录参数。

## 规则

- `spawn` 的模型结果只有 `{id, status, worktree?}`；`steer` / `stop` 只有 `{id, status}`。
- `inspect` 的每一项只有 `{id, status, cwd, worktree?}`。
- 服务层的 `Spawned` 与 `RunView` 照常带 `sessionFile`、`runDir`、`paneId`：它们是本包其他代码的返回值，不是模型面。留字段不等于放行，模型面只由 `face.ts` 决定。
- `Envelope.paths` 只有 `{worktree?, output?}`；都为空时不渲染路径段。
- 需要定位文件的人按目录约定找：`<agent-dir>/pi-herdr-subagents-lite/runs/<id>/`。

## 保留

- `worktree` 路径：父代理要在那里审 diff 或接着改，是行动而非旁观。
- 超长时的 `output.md` 路径：summary 被截断后全文的唯一入口，本来就是子代理写给父代理的东西。
- `spawn_failed` 只报 herdr 的错误文本，不再附 pane id：失败即回滚，pane 已被关掉，id 没有用；要找人按 `herdr agent list` 的 run 名。

## 剩下的门

本决策关掉的是「顺手就能读」，不是围栏。删完字段后仍有三条路：

1. run 目录由 id 推导，不传也能猜出 `<agent-dir>/pi-herdr-subagents-lite/runs/<id>/`。
2. `bash` 里直接调 `herdr agent list` / 读 pane，绕开本扩展。

原来还有一条：`output.md` 与 `session.jsonl` 同住 `runs/<id>/`，父代理 `ls` 一下就能看到会话。这条已由 [DEC-0075](0075-child-session-outside-run-dir.md) 关掉——会话搬到 `sessions/<id>/`，与产物分家。

原来还有一条：herdr 的报错原文经 `errorText` 原样进模型面，可能带 pane id 或本机路径。这条已关闭——`errorText` 把 pane id 抹成 `<pane>`、绝对路径抹成 `<path>`，只留错误码和形状。

剩下的两条都不是布局问题：第一条靠猜，第二条只能由宿主的 `tool_call` 拦截兜底。

## 否决的替代

- 只删结算消息里的 `session:` 行，留着 `spawn` 结果里的 `sessionFile`：一次 `spawn` 就够顺着目录读到全部子会话。
- 把路径塞进工具结果的 `details`：本扩展 `content` 与 `details` 是同一份 payload，模型照样看得见。
- 在文案里劝父代理别读：约束不落在机制上；路径一旦摆在消息里，读的成本低于不读。
- 只从 `content` 删、把值留在 `details`：本扩展 `ok()` 两处同一份 payload，藏不住；今天 `details` 也没有渲染方。
