# run

run 生命周期内核：启动、send、回合事件、结算、关闭。对外行为见 [v1 契约](../specs/0001-v1-contract.md)。本文只写取舍。

## 结构

`index.ts` 是门面，其余 21 个文件各管一件事：`start`、`retry`、`slot`、`naming`、`resolve`、`truncate`、`spawn-args`、`paths`、`pane`、`settle`、`watch`、`result`、`send`、`resume`、`prune`、`state`、`errors`、`close`、`find`、`aggregate`、`artifact`。

## 状态

每个 run 有五个状态。

| 状态 | 含义 | 占并发槽 |
|---|---|---|
| `starting` | 已占槽，pane 或 agent 还没就绪。`run` 与 `send` 触发的重启都从这里开始 | 是 |
| `running` | 有回合在飞 | 是 |
| `idle` | 回合结束，等 `send`。pane 可能已关（`paneClosed`） | 否 |
| `dead` | 判定失去联系，记录留着等 `send` 重启 | 否 |
| `closed` | 已从服务移除 | 否 |

## 回合事件

- 父侧 500ms 扫一次各 run 的 `.turns/` 目录。事件就是文件，扫描是唯一触发。
- 不用 `fs.watch`：Windows 上删掉被监视的目录会让 Node 在 `fs-event.c` 断言崩溃。500ms 一次 readdir 没有进程启动，也没有句柄生命周期。
- 一个回合只走 `settleTurn` 一条路径：投递 → 删除文件 → 按判据关 pane → 改状态。没有第二条补关路径。
- 投递失败保留文件，下一拍重试；三次失败后丢弃并通知。
- 同一回合号只投一次，按 `lastTurn` 去重。

## 存活

- 只有 `running` 的 run 查 `agent list`，每 15 秒一次。`starting` 不查：pane 与 agent 都还没登记，查了就是误判（DEC-0066）。
- 上一拍没回来就跳过这一拍。`listAgents` 慢于轮询间隔时，叠加会把缺席多记一遍，三拍就误判。
- `findAgent` 先按 session 文件、再按 `paneId`、最后按 `name`。
- 连续三次查不到、且 pane 还在，判定 `dead`（DEC-0064）。pane 不在则立即判定。
- 不拿 pane 文本、退出码或 session 尾部猜死活。

## 槽位

- `running` 与 `starting` 占槽。`idle` 与 `dead` 不占，父代理还能继续派活。
- `run` 在第一次 await 之前占槽，并发的 `run()` 立刻看到它。
- `send` 触发的重启也要占槽。已满时返回 `max_concurrent`，不投递、不重启。

## send

- `starting`：拒绝，报 `spawn_failed`。并行工具调用里第二条 `send` 撞上同一个重启窗口；让它排队会在同一个 pane 上起两次 agent。
- `running`：直接写 inbox，不再查 `agent list`。
- `idle`：查一次 `agent list`。找到就写 inbox，找不到就按 `dead` 重启。
- `dead`：从同一个 session 文件重启。先查尾部有没有未完成的工具调用。
- 只有显式 `send` 才重启，死亡不自动重启（DEC-0031）。
- 重启重读 profile，不用快照。

## 关闭

- 判据见 DEC-0063：`done` + `auto-exit` + 没有活着的子代理，或 `quit` / `dead`，或 `closeOnFailure`。
- `pane close` 重试 3 次、间隔 250ms。`pane_not_found` 算已关。
- 关失败只通知一次，不改变已投递的结果。
- 关 pane 后不删记录。`send` 见 `paneClosed` 直接重启，不再查 agent。
- 先投递，再关 pane。
- 回合已收尾的 run 再收到 `quit` 事件（子代理随后退出）只静默关 pane，不再向父模型补一条「没汇报结果」。
