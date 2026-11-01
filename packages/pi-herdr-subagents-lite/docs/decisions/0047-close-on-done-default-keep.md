# 0047 只有 auto-exit 关 tab

完成后默认保留 tab：`auto-exit` 默认 false 时不 release、不关 tab，子代理继续存活并占用一个 `maxConcurrent` 槽，`send` 可以续聊。只有 `auto-exit: true` 的子代理自己 shutdown 并投递 done 结果后，父侧才关只含该 pane 的 tab；unknown 不关。没有全局开关；父会话结束时是否关子 tab 由 `closeChildrenOn` 决定（DEC-0048）。

依据：默认关闭会让完成后的 `send` 无目标；自退由子进程判断，能看到未答对话框与排队消息。早期实现的「done 即关」按本条作废，记录在 git。
