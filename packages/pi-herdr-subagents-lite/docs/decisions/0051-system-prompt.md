# 0051 system-prompt 三种模式

`system-prompt` 取值：`append`、`replace`、`task`；省略 = `append`。`task` = profile body 拼在任务简报前，作为 user message。

`--append-system-prompt` 会覆盖 pi 对 `APPEND_SYSTEM.md` 的自动发现；需要时把发现到的文件也传一遍。

依据：默认保留 pi 的 system prompt；`task` 是省流模式，需显式选择。
