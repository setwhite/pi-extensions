# 0068 run 附属文件按保留期清理

`runs/` 下的 brief、identity、inbox、回合事件、artifact 按修改时间保留 `runRetentionMs`（默认 30 天，`0` = 永不清理）。每次会话启动清一次，本次会话在跑的 run 一律不删。

## 为什么

这些文件只增不减。一个 run 十几 KB，超长结果还要额外写 artifact。

## 规则

- 保留期进配置（DEC-0011）：用户得能选「永不清理」。
- 只按 mtime 判断，不读内容，不认领别人的文件。
- 过期后 `Full result:` 路径失效。契约 §6 不再承诺 artifact 永久保留。

## 代价

- 长会话里父模型上下文中的 `Full result:` 路径可能在之后失效。
- 删除是静默的，失败也不通知。
