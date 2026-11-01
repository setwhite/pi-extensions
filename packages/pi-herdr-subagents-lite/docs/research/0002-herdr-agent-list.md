# 0002 herdr agent list 实测

采集：2026-10-28，herdr 0.9.5，`herdr agent list`。同会话另有 working 的 pi agent；第三个 pane 的 pi agent 先 `herdr agent rename wG:p5 probe-agent`，采集后 `--clear`。

## 原始 JSON

```json
{"id":"cli:agent:list","result":{"agents":[{"agent":"pi","agent_session":{"agent":"pi","kind":"path","source":"herdr:pi","value":"C:\\Users\\Charles Liu\\.pi\\agent\\sessions\\--C--Users-Charles Liu-Desktop-herdr探索--\\2026-10-27T09-24-05-193Z_01a17cac-8bc9-72be-878b-87c2893b83bc.jsonl"},"agent_status":"idle","completion_seq":29,"cwd":"C:\\Users\\Charles Liu\\Desktop\\herdr探索","focused":false,"pane_id":"wG:p1","revision":16,"screen_detection_skipped":true,"state_change_seq":29,"tab_id":"wG:t1","terminal_id":"term_65ececc6c422d6","terminal_title":"π - herdr探索","terminal_title_stripped":"π - herdr探索","workspace_id":"wG"},{"agent":"pi","agent_session":{"agent":"pi","kind":"path","source":"herdr:pi","value":"C:\\Users\\Charles Liu\\.pi\\agent\\sessions\\--C--Users-Charles Liu-Desktop-herdr探索--\\2026-10-27T10-36-22-659Z_01a17cee-bb03-713c-9530-10c4c053008c.jsonl"},"agent_status":"working","cwd":"C:\\Users\\Charles Liu\\Desktop\\herdr探索","focused":true,"pane_id":"wG:p4","revision":16,"screen_detection_skipped":true,"state_change_seq":88,"tab_id":"wG:t4","terminal_id":"term_65ed00449e0839","terminal_title":"π - herdr探索","terminal_title_stripped":"π - herdr探索","workspace_id":"wG"},{"agent":"pi","agent_session":{"agent":"pi","kind":"path","source":"herdr:pi","value":"C:\\Users\\Charles Liu\\.pi\\agent\\sessions\\--C--Users-Charles Liu-Desktop-herdr探索--\\2026-10-27T17-24-44-621Z_01a17e64-99cd-70ca-861f-a1b7dc7cd359.jsonl"},"agent_status":"idle","completion_seq":85,"cwd":"C:\\Users\\Charles Liu\\Desktop\\herdr探索","focused":false,"name":"probe-agent","pane_id":"wG:p5","revision":16,"screen_detection_skipped":true,"state_change_seq":85,"tab_id":"wG:t5","terminal_id":"term_65ed0075d1f0da","terminal_title":"π - herdr探索","terminal_title_stripped":"π - herdr探索","workspace_id":"wG"}],"type":"agent_list"}}
```

## 字段结论

| 字段 | 出现条件 | v1 用途 |
| --- | --- | --- |
| `result.agents[]` | 每个带 agent 的 pane 一条 | 一拍一次，覆盖所有 run |
| `pane_id` | 总有 | 定位 run 的首选键；改名不变 |
| `name` | 只在该 agent 被命名后（`agent start <name>`、`agent rename`） | 次选键；run 自己的 agent 一定有名 |
| `agent_status` | 总有 | `idle` / `done` 才读子 session 尾部 |
| `completion_seq` | 只在 `idle` / `done` 时出现（working 条目没有） | 完成序号，与 `lastHandledSeq` 比较 |
| `state_change_seq` | 总有，working 时也更新 | `completion_seq` 缺失时回落 |
| `agent` | 总有，恒为 `pi` | 不用 |
| `tab_id`、`cwd`、`agent_session`、`revision`、`focused`、`terminal_*`、`workspace_id` | 总有 | 不用 |

结论（2026-10-23 当时）：按 `pane_id` 匹配，`name` 兜底；序号取 `completion_seq ?? state_change_seq`，两者都缺按 0。

## 后续

定位顺序后来改为 session 文件优先、再 `pane_id`、最后 `name`（[0005](0005-herdr-agent-targets.md)、`src/run/find.ts`）。上表的字段测量仍有效。
