# policy

`src/policy/`

## 取舍

- 拒绝共用 `locked` 类别，hint 指出下一步（`Run /chrome authorize on`）。SPEC-0001 的错误表按类别给 hint，策略拒绝的下一步却随策略走，所以 hint 随拒绝走，不进 protocol 的类别表。
- 拒绝以结果返回、不抛出：SDK 会把抛出的错误换成 `details` 为 `{}` 的结果，SPEC-0001 要的 `details.error` 得自己放。
- 判定不做 IO、没有定时器，状态只在内存：会话结束回到未授权，进程退出不留痕迹。
- 背景模式已删，理由见 [DEC-0007](../decisions/0007-drop-redundant-pieces.md)。
