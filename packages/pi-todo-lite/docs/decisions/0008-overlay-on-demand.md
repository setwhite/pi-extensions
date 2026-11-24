# 0008 浮窗按需挂载

**决定**：`ui.mode: "overlay"` 的角落浮窗只在「有任务、未折叠、有 UI」时挂着。空表、折叠、`!ctx.hasUI` 一律释放。取代 DEC-0007 里「挂常驻浮窗」与「折叠不撤窗」两句。

**为什么**：

1. `ctx.ui.custom` 是要到 `done()` 才结束的交互。pi 对它发 `ui_prompt_start`，别的扩展（herdr 状态上报、子代理上报）会把它当成「这个 pane 在等用户回答」。浮窗是非捕获装饰，从头挂到尾就从头误报到尾：herdr 里这个 pane 一直显示红色 blocked，`herdr agent start` 还以 `agent_not_ready` 拒绝它。
2. 空表时 `visible()` 本来就是 `false`：看不见，却仍占着那个交互。提前挂好省的这一次挂载不值这个代价。

**代价**：

- 首条任务提交时多一次挂载。异步，不阻塞 `session_start`。
- 折叠从「压成一行留在浮窗里」改成「卸载浮窗、底栏留一行」。位置仍在角落附近，渲染方换成了 `setStatus`。
- `session_compact` 与 `session_tree` 也重置折叠：`restore()` 只有一个入口。

**没选**：只在 `session_start` 判断一次。中途清空表仍会留着交互，误报照旧。
