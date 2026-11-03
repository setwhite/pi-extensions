# herdr 0.9.5：按 pane 关闭

目的：确认「关掉子代理的 pane」能不能只靠一条命令完成，不必先读 tab 快照。测试用 isolated named session，结束后 `server stop` + `session delete`。

## pane close 有效

```
$ herdr --session S pane close w1:p2
{"id":"cli:pane:close","result":{"type":"ok"}}
```

tab 里还有别的 pane 时，tab 保留：

```
# 先 pane split w1:p2，tab 变成 2 个 pane
$ herdr --session S pane get w1:p2
{"result":{"pane":{"pane_id":"w1:p2","tab_id":"w1:t2","workspace_id":"w1",...}}}
$ herdr --session S pane close w1:p2
{"result":{"type":"ok"}}
$ herdr --session S tab list --workspace w1
{"result":{"tabs":[{"tab_id":"w1:t1",...},{"tab_id":"w1:t2","pane_count":1,...}]}}
```

关掉 tab 里最后一个 pane 时，tab 自己消失：

```
$ herdr --session S pane close w1:p2      # w1:t2 只有一个 pane
{"result":{"type":"ok"}}
$ herdr --session S tab list --workspace w1
{"result":{"tabs":[{"tab_id":"w1:t1",...}]}}   # w1:t2 不在了
```

## 重复关闭的返回

```
$ herdr --session S pane close w1:p2
{"error":{"code":"pane_not_found","message":"pane w1:p2 not found"}}
$ echo $?
1
```

`pane_not_found` 表示目的已达成，不是失败。协议层错误（socket、JSON）仍是失败。

## 与 tab 级快照的对比

`pane get <id>` 一次只答一个 pane，带 `tab_id`：

```
$ herdr --session S pane get w1:p2
{"result":{"pane":{"pane_id":"w1:p2","tab_id":"w1:t2","workspace_id":"w1"},"type":"pane_info"}}
```

旧实现读的是 `tab get` 的 `pane_count` 加 `pane list --workspace` 的过滤结果。两次采样之间 herdr 正在重登记 pane（同 [DEC-0052](../decisions/0052-completion-snapshot.md) 记的抖动），对不上就放弃关闭。结论：关闭不需要读快照。

## 子代理进程退出后 pane 还在

子代理 pi 退出（Ctrl-D）后：

```
$ herdr --session S agent list
{"result":{"agents":[]}}
$ herdr --session S tab get w1:t2
{"result":{"tab":{"pane_id":"w1:t2","pane_count":1,"agent_status":"unknown",...}}}
```

pane 不会因为进程退出而消失，herdr 也不收 tab。关闭必须由父侧发起。
