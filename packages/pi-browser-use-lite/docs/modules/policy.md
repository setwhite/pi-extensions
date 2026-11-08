# policy

`src/policy/`

## 取舍

- 授权与背景拒绝共用 `locked` 类别，下一步动作靠 hint 区分。SPEC-0001 的错误表按类别给 hint，策略拒绝的下一步却取决于哪条策略，所以 hint 随拒绝走，不进 protocol 的类别表。
- 背景模式不挡 `chrome_tab new` 与 `navigate`：那两处靠强制 `background: true` 不抢前台，只有聚焦动作直接拒。
- 聚焦规则按动作名 `switch` 判，不按工具名判：工具名可被 config 改名，动作名不会。判定只收动作名，调用参数进不来，单次调用因此无从覆盖。
- 拒绝以结果返回、不抛出：SDK 会把抛出的错误换成 `details` 为 `{}` 的结果，SPEC-0001 要的 `details.error` 得自己放。
