# 0067 herdr 调用有边界

每条 herdr 命令都有超时：查询 20 秒，变更 120 秒。工具调用的 abort 信号一路传到 `execFile`。

## 为什么

两个根因。一是 `execFile` 不设上限，herdr 卡住就吃掉整轮工具调用。二是工具调用的 `signal` 一直被丢掉：用户按 Esc 之后 `agent start` 照样跑完、pane 照样建出来，父侧记的是中止，子代理已经在干活。

## 规则

- 查询（`agent list`、`pane list`）超时当这一拍没数据，下一拍重来，不通知。
- 变更（`tab create`、`agent start`、`pane close`）超时报 `herdr_timeout`，文案写「可能已经生效，先去 tab 确认」。不复用 herdr 的 `timeout`：那个 code 专指 `agent start` 等 idle 等超了，提示语完全不同。
- abort 与父会话关闭走同一条 `cancelled()`：关掉已建的 pane，释放 run 记录。
- 两个数值是常量，不进配置（DEC-0011）。

## 代价

- 变更超时后状态不确定，用户得自己去 tab 看一眼。
- 120 秒对已经死掉的 herdr 来说仍然长，但它是兜底，不是主路径。
