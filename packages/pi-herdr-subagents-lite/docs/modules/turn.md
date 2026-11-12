# 模块 · turn

子代理的终止通道。每个结束的回合写一个文件，父代理只读这个文件。

## 文件

```text
<runBase>.turn            计数器，内容是下一个回合号
<runBase>.turns/000001.json
```

字段见 [DEC-0062](../decisions/0062-turn-event-contract.md)。

## 接口

| 名字 | 用途 |
|---|---|
| `classifyTurn` | 纯函数。`stopReason` + `pendingToolCall` + `aborted` → `outcome` |
| `nextTurn` | 读计数器、加一、原子写回 |
| `writeTurn` | temp + rename 写入 |
| `readTurn` | 坏文件返回 `null`，不抛 |
| `listTurns` | 按回合号排序 |
| `removeTurn` | 消费后删除，重复删除不报错 |

## 边界

- 只有子代理写，只有父代理读。单写者，所以不需要锁。
- 判定只回答「这一轮怎么结束」，不回答「子代理接下来该干什么」。
- 文件丢了就是没有结果，由存活兜底报 `lost`，不猜。
