# waitFor

`browser-extension/background/page/waitFor.js`

## 取舍

- 轮询在 service worker 里，页面里不跑循环：页面里的循环要 `setTimeout` 加 `eval` 一类的东西，严格 CSP 下起不来。一次探测就是一条 `Runtime.evaluate`，也顺手绕开了页面 CSP。
- 间隔与默认时限写死在模块里，不读配置：SPEC-0001 把 250 毫秒与 15 秒列为不可配置项，配置面每多一个旋钮就多一处要解释的默认值。
- 探测报错立刻上抛，不当成「还没命中」重试：表达式写错、所在 frame 被换掉、调试器掉了，等下去都不会变对，重试只是把一次明显的错拖成超时。要等页面状态就写成不会抛的形式（`typeof window.app !== "undefined" && window.app.ready`）。
- 探测表达式自己就归成布尔值，`hit()` 再按 `=== true` 卡一遍：`Runtime.evaluate` 回的是页面值的 JSON，不同 kind 回的东西不同，只有布尔才有一个判断点；也顺手挡掉页面表达式返回 `1` 或 `"yes"` 被当成命中的情况。
