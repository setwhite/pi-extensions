# 0075 子会话与 run 产物分家

子会话不再住在 run 目录里：产物在 `<dataDir>/runs/<id>/`，会话在 `<dataDir>/sessions/<id>/session.jsonl`。两棵树同形（都是 `<id>/` 一层），同一套保留期清理跑两遍。`runRetentionMs` 到期时一起删。

## 为什么

父代理会拿到 `output.md` 的路径（summary 被截断时的全文入口，见 [DEC-0074](0074-model-face-without-paths.md)）。只要会话和产物同目录，父代理 `ls` 一下那个目录就看到 `session.jsonl`——模型面删掉的路径，从文件名旁边又被捡回来。

两棵树的名字就是边界：`runs/` 里放的都是「能交给父代理的」，`sessions/` 是「只给人调试的」。父代理手上的任何路径都落在 `runs/` 下，顺着它往上或往下都碰不到会话。

## 保持 `--session` 而不是 `--session-dir`

`steer` 续跑与打断兜底都会关掉 pane 再用 `record.args` 重开（`run/pane.ts:20`），必须指回同一个会话文件才能接着聊。`--session-dir` 让 pi 自己命名，重开就等于新建会话，上下文丢失。所以每次 run 的会话路径固定为 `sessions/<id>/session.jsonl`，重开时照旧复用。

## 否决的替代

- **放任 pi 的默认位置**（`<agent-dir>/sessions/<cwd 桶>/`）：子会话与父会话同级。`listSessionsFromDir` 只读一层，子会话会混进人类的 `/resume` 列表；`continueRecent` 取该桶最新会话，子代理结束得更晚，`pi --continue` 会接上子代理的上下文。
- **`--session-dir` 指到我们的根**：pi 负责命名，但重开 pane 会新建会话（见上）。
- **会话放在宿主 sessions 树的下层**（v1 的 [DEC-0053](0053-session-dir.md)）：那要用 cwd 算桶名，而清理时 cwd 已经不在手上，只能在 run 目录里补一份元数据。而且我们的清理不该伸进人类的会话库。
