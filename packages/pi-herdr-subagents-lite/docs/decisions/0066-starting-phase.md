# 0066 启动中也是状态

run 增加 `starting`：已占并发槽，pane 或 agent 还没就绪。`run` 与 `send` 触发的重启都从这里开始，等 pane 与 agent 都登记完才转 `running`。

## 为什么

原来 run 一进 `state.runs` 就是 `running`。存活对账只查 `running`，于是在 `tab create` / `agent start` 还没返回时就查 `agent list`：查不到，pane 也还没登记，一拍就判 lost，父模型收到一条 `lost contact; no result`。实测把 `createTab` 卡住 45 秒（三拍）就能复现。

## 规则

- `starting` 占槽，`idle` / `dead` 不占。
- 存活对账只看 `running`。
- `send` 撞上 `starting` 直接拒绝（`spawn_failed`），不排队：并行工具调用里第二条 send 撞上同一个重启窗口，排队会在同一个 pane 上起两次 agent。
- `requireSlot` 排除发起重启的 run 自己，否则它自己的 `starting` 会挡住自己。

## 代价

- 状态机多一条边。DEC-0065 的四状态图按本文补上 `starting`。
- `send` 多一个可失败分支。
