# 0040 bridge 上报 blocked

bridge 是主扩展内的监听器（DEC-0049）：监听 pi 原生 `ui_prompt_start` / `ui_prompt_end`，emit `herdr:blocked`；`blockedOn` 可配；全局安装后父子进程都上报。

依据：herdr 集成只监听 `herdr:blocked`；`ui_prompt_*` 覆盖所有 `ctx.ui` 对话框。
