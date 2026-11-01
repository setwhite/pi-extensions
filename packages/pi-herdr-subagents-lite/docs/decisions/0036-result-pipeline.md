# 0036 结果投递路径

完成检测见 [DEC-0052](0052-completion-snapshot.md)。这条决策只定下游：超过 `maxResultChars` 写 artifact，消息只带头部与路径。

依据：父会话上下文有限，全文塞进去会挤掉任务；artifact 保留原文，人工可查。
