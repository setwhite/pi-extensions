# 0060 关闭按 pane，不按 tab

两处判据一起改。关闭只发 `pane close <paneId>` 一条命令，不再核对 tab 里有几个 pane。`pane_not_found` 视为已关掉：关闭幂等，重复调用没有副作用。投递判据看「尾部换过没有」，不看「文本和上次相同」。

## 为什么换

旧实现关 tab 前查两次快照：`tab get` 的 `pane_count` 必须是 1，`pane list --workspace` 里必须恰好一条且 pane id 对得上。两次是独立采样。子代理刚收工的那一刻正是 herdr 重登记 pane 的窗口（[DEC-0052](0052-completion-snapshot.md) 记过同一个抖动，实测超过 4 秒），`pane list` 少报一条就返回 `kept`。

`kept` 被丢弃：没有通知、没有重试，run 紧接着 settle，之后没有任何路径再关这个 tab。事故现象就是「子代理正常收工、结果也投递了、会话关掉、tab 留在原地」，而且完全无声。

`kept` 这个状态本身就不该存在：它把一次瞬时读失败升级成永久拒绝。按 pane 关只有一条命令，没有快照可撕裂。

同一次事故还暴露第二条判据。去重只看文本、不看 turn：子代理续聊后写出和上一轮逐字相同的答案（「Done.」「没有需要改的」），父侧当成重复，既不投递也不关。结果和关闭一起被吞掉。

## 代价与边界

- 只动父侧自己创建的 pane。同一 tab 里用户 split 出来的 pane 不受影响 —— 比旧的「有多个 pane 就整个不关」更接近直觉。
- 关掉 tab 里最后一个 pane 时 herdr 自己移除 tab（[实测](../research/0006-herdr-pane-close.md)）。所以效果与关 tab 等价，只是范围小。
- 不再核对身份。run 记下的 pane id 若变陈旧（herdr 重启、会话重建），理论上会关到别人的 pane。实测 herdr 重启保留 pane id，窗口极小；且破坏半径从一个 tab 降到一个 pane，比旧实现小。
- `unknown` 结果仍然不关（DEC-0047 的这条不变）。

## 关不掉不再是终态

`finish` 关 pane 抛错时不结算，保留 live 并补投一条 `close_failed`。子代理随后死亡时 `exited` 再关一次。结果已投递过也照样补关：投递和关闭是两个独立判据，不再绑在同一次 `finish` 里。两次都失败各补一条 `close_failed`。

## 判据：尾部换过没有

文本或 session 文件字节数任一变化，就算换了一条消息。字节数取自 `readLastAssistant` 返回的 `size`，不额外 stat（见 [session-file](../modules/session-file.md)）。session 文件只追加，字节数单调增。

代价：同一 turn 的尾部被投递后，子代理又追写了非 assistant 内容（例如 `send` 写进 session 的用户消息）然后被杀，会重复投一次同一段文本。选它是因为「多投一次」比「静默丢一条结果」便宜。

## 否决的替代

- 保留 `tab close`，两次查询压成一次 `pane get` 比对 `tab_id`。查询降到一个，仍是读-判断-写，抖动窗口还在。
- 关闭判据改成「这个 pane 里没有活着的 agent」。`agent list` 的登记本身会抖（DEC-0052），父侧分不清「还没起」与「已退出」。
- 死亡时不补关，只在投递那一刻关一次。就是本次事故的现状。
- 去重只看文本：吞掉逐字相同的另一轮答案。只看字节数：文件被等长覆写时失效，测试里已真实撞上。用 mtime：同一毫秒内两次写入分不开。

依据见 [研究 0006](../research/0006-herdr-pane-close.md)。
