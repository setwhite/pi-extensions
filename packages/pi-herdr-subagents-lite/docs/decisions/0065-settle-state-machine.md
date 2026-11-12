# 0065 结算收敛成一个状态机

每个 run 只有四个状态：

~~~text
running --回合事件--> idle --send--> running
   |                   |
   | 关 pane            | 连续缺席三次
   v                   v
idle (paneClosed)     dead
        \              /
         \--父会话退出--/
                 v
              closed
~~~

`settle` 是唯一收尾入口：投结果 → 按判据决定是否关 pane → 改状态。删除 `finish`、`exited`、`closeAfterExit` 三套各写一遍的结算。关 pane 只是 `idle` 上的 `paneClosed` 标志，不是单独状态。`closed` 只在父会话退出或 `closeChildrenOn` 命中时出现，删了记录就再也没法 `send`。

## 为什么

三个函数各自决定「要不要结算」「要不要关 pane」，规则互相矛盾：`finish` 只在 `done && autoExit` 时关，`exited` 只在子代理死亡时补关，`closeAfterExit` 又是第三条路径。unknown 结果一条都不关，pane 就停在会话结束的终端界面。

`live` 一个字段同时表示「等下一轮」与「pane 没关」，无法从代码推出哪个分支该做什么。

## 规则

- 投递成功才删回合文件。投递抛错就保留，下一拍重试；连续三次失败通知一次。
- 关 pane 失败不改变已投递的结果，只记 `leftOpen` 并通知一次。
- 先投递，再关 pane。反了会丢结果。
- `settle` 幂等。同一回合重复到达不重复投递，按 `lastTurn` 去重。
- 关 pane 不删记录。`paneClosed` 的 run 再收 `send` 时直接重启，复用同一个 `sessionFile`。

## 代价

- 状态机是新的显式概念，测试要覆盖四条边。
- `idle` 的 run 仍占内存与 pane，不占并发槽。并发限制只数 `running`。
