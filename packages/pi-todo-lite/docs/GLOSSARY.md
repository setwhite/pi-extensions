# 术语 · pi-todo-lite

一个会话里只有一张表。本文件给这张表的概念定名。词打架时以这里为准。

## 命名

**表（table）**:
本会话的完整清单：有序的 `Task` 数组，整表提交。
_别叫_: list, checklist, plan

**任务（task）**:
`content` + `status`。没有 id，没有依赖。
_别叫_: item, todo

**状态（status）**:
三态 `pending` / `in_progress` / `completed`。没有 `deleted`。文案与模板里数 `in_progress` 用 `doing`。协议与代码写 `in_progress`。
_别叫_: state, 四态

**快照（snapshot）**:
写进会话文件的那条 entry。每次变化写一条。
_别叫_: state, checkpoint, 存档

**回放（replay）**:
由最新一条有效快照把表恢复出来。
_别叫_: restore, load

**浮窗（overlay）**:
角落那块常驻任务表。不抢键盘焦点，不占对话行数。配置键 `ui.overlay` 指它的位置与尺寸。
_别叫_: widget, panel, HUD

**状态行（status）**:
底栏那一行进度：表头加第一条进行中的任务。`ui.mode: "status"` 时的常驻形态，也是浮窗在窄屏下的降级形态。
_别叫_: status line, footer

**widget**:
渲染配置块（`ui.widget`）：字形、表头、行预算、完成样式。它管表长什么样，不管挂在哪。
_别叫_: overlay, panel

**折叠（collapsed）**:
收起浮窗的表体，只留表头加第一条进行中；再按一次键展开。浮窗本身不消失，任务表不动。
_别叫_: hide, minimize

**清空（clear）**:
把表变成空表：写一条 `{tasks: []}` 快照。与折叠的区别是它动账。
_别叫_: reset, wipe

**清单（renderList）**:
`/todos` 打出的全表文本，不截断，不省条目。别拿它指 widget 或表数据本身。
_别叫_: list, dump

**导出 / 导入（export / import）**:
`/todos export` 吐 markdown，`import` 读回。两态有损。
_别叫_: dump, 序列化

**工具名（toolName）**:
模型看到的工具名。错误前缀与文案占位符都用它。
_别叫_: commandName
