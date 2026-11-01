# 0053 子 session 放在 agent dir

子 session 放在 agent dir 的 `sessions/` 下（见契约 §1）；brief、inbox、artifact 是它的兄弟文件，不建 run root。每个 run 用新 `runId`，不复用。

依据：用户选择；临时目录会被系统清掉，人工恢复不可靠。角色信号见 [DEC-0046](0046-no-role-detection.md)。
