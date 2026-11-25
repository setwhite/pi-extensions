# 术语 · pi-ask-question-lite

一次工具调用只问一轮。本文件给这一轮里的东西定名。词打架时以这里为准。

## 命名

**题（question）**:
必填文本加若干选项，可带 `title`。一次调用 1 到 4 题。
_别叫_: prompt、问题单

**选项（option）**:
`label` 加可选 `detail`、可选 `preview`。每题 2 到 6 个。
_别叫_: choice、item

**答案（answer）**:
一题的结论：`selected` 下标、可选 `custom`、可选 `note`（单选）/ `notes`（多选，按选项下标）。
_别叫_: result、response

**有结论（answered）**:
该题 `selected` 非空，或 `custom` 去空白后非空。
_别叫_: completed、filled

**补充（note）**:
挂在某个选项上的一句话。单选取选中项那一条（`note`），多选每个选项各一条（`notes`），取消勾选就一起清掉。
_别叫_: comment、annotation

**自由输入（custom）**:
每题底部的文本框，可以和勾选并存，多行。
_别叫_: other、custom option

**确认行（confirm）**:
多选末尾的 `→ Confirm`。Enter 收本题并推进；空着按也推进，该题进 `skipped`。
_别叫_: next、submit

**提前提交（submit early）**:
`keys.submitEarly`（默认 `ctrl+enter`）。提交已答的题，未答的进 `skipped`。
_别叫_: skip、partial submit

**折叠（collapse）**:
`keys.collapse`（默认 `ctrl+]`）把面板收成一行进度。只改渲染，不动焦点、答案与草稿；再按同键展开。
_别叫_: minimize、hide

**中止（abort）**:
Esc。整次放弃，不带回任何答案，本轮结束。
_别叫_: cancel、refuse

**草稿（draft）**:
编辑态按 Esc 退回列表时留下的文本，下次进编辑带回来。
_别叫_: buffer、暂存

**预览（preview）**:
选项的 Markdown 原文。宽屏并排、窄屏堆叠。
_别叫_: detail、description

**阻塞标记（blocked）**:
`pi.events` 上的 `herdr:blocked` 事件。挂载前发 `active: true`，`finally` 发 `false`。
_别叫_: herdr 集成、红点
