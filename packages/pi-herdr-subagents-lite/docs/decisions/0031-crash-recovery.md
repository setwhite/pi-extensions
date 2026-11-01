# 0031 死亡不重启，send 可续聊

子代理死亡不自动重启；死亡原因读 `<childSession>.exit`：有回执 = 走过 shutdown，没有回执 = 进程没走 shutdown（崩溃 / 被杀）。`send` 到已退出的子代理时用同一 session 重启续聊（错误码见契约 §3）；重启重新读 profile，不用快照。herdr server 重启不处理。全局安装后不依赖 `-e`。

依据：用户选择；重启只在显式 `send` 时发生，避免死亡后自动重跑副作用；重读 profile 省掉 loadout 文件。实测 `-e` 在 server 重启后丢失，悬空 toolCall 会变成 No result provided。
