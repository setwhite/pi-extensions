# 0034 模型面只有一个工具，两个 action

模型面只有一个工具，两个 action：`run(profile, task)` 和 `send(name, message)`。没有 wait / list / status / cancel / answer。profile 列表写进 guidelines；未知 profile 的报错回列表；超并发列 live 名称。

依据：用户选择；list/status/cancel/answer 有原生替代。
