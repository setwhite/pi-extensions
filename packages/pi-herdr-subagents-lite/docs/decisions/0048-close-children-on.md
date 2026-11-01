# 0048 父会话结束按 closeChildrenOn 清理

`closeChildrenOn` 是 `session_shutdown.reason` 数组，默认空；命中时关闭该父会话拥有的子 tab，未命中只停投递；崩溃不关、不认领。

依据：`/new`、`/resume`、`/fork`、`quit` 的取舍因人和任务而异，固定任一种都会误杀或留僵尸。
