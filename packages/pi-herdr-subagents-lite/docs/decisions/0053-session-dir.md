# 0053 子 session 与 run 文件的位置

子 session 放在父会话所在桶的 `runs/` 子目录：`<agent-dir>/sessions/<cwd 桶>/runs/<name>-<runId>.jsonl`。run 的附属文件另放 `<agent-dir>/pi-herdr-subagents-lite/runs/`，一层平铺，靠后缀区分：`<runBase>.brief.md`、`.identity.md`、`.inbox/`、`.exit`、`.result-<seq>.md`。每个 run 用新 `runId`，不复用。

依据：用户选择。session 与父会话同在 sessions 树里，人工恢复时一眼能找到。附属文件必须与 session 分家：模型会拿到 artifact 路径，session 若在同一个目录，父模型顺手就能读到子会话正文，子代理的上下文隔离失效。系统临时目录会被清掉，也不能用。

子侧不靠环境变量找附属文件：它本来就要按同一个 agent dir 读配置与 profile，所以用自己 session 文件的主名拼 `<runBase>` 足够。

pi 只列 session 目录的一级：`findMostRecentSession`、`listSessionsFromDir` 与 `listAll` 都不下钻子目录。所以 `pi --continue` 与 `/resume` 看不到子会话。

代价：子会话不出现在任何 pi 列表里，只能按路径找。

角色信号见 [DEC-0046](0046-no-role-detection.md)。
