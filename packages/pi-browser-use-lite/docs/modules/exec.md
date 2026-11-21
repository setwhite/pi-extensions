# exec

`src/tools/exec/`、`src/tools/result.ts`、`src/tools/errors.ts`、`src/format/`

## 取舍

- 宿主每条命令都带 `sessionKey`，取 `ctx.sessionManager.getSessionId()`：target 台账在扩展侧、按会话分，宿主没有第二个 id 可用。换会话就换 key，所以 target 自然隔离。
- `tab` 参数（id、URL 子串、标题子串）在宿主解析成 `tabId`：`tab_not_found` 与 `tab_ambiguous` 的候选文案是模型可见文本，按 ARCHITECTURE §2 只能由 `tools/` 组装。代价是带 `tab` 的一次调用多一条 `tab.list`。
- 变更量由扩展在同一次动作里给（`changed: { added, removed, updated }`）：diff 与基线都在扩展侧，宿主再发一次快照会把「一次交互」拆成两条命令，且两次快照之间的变化归属不清。
- 错误分类收在一个 `classify()`：桥抛的 `BridgeError` 认自己的类别，本包里 `fs/` 这类叶子模块抛的 `<class>: …` 认前缀，其余归 `page_error`。12 类类别与 hint 都从 `protocol/` 取，不抄第二份。
- 从未见过的扩展给 2 秒首次轮询宽限；2 秒后仍没连上就报 `extension_missing`，不等到 30 秒超时。见过但过期的扩展立即报，不白等。
- `batch` 用一次调用的预算（30 秒）分给各步：每步的超时取剩余时间，超预算就停在当时那一步并报 `timeout`。
- 截图的落盘函数可注入，默认 `src/fs/` 的实现：扩展只回 base64，写盘与修剪归宿主，测试因此不用碰磁盘。
- 元素清单的字符预算（`output.refsChars`）在宿主算，不在扩展：一行最后长什么样只有拼正文的 `format/` 知道，放到扩展就得抄一份拼法。裁过由 `snapshotOf` 补一行 hint，`details.elements` 与正文同一份。
- `eval` 与 `cdp` 的返回值共用字符预算（`output.evalChars`），交给 `format/` 的 `evalText`、`cdpText`。超预算时按结构剪：数组留前几项、对象留前几个键，末尾塞一条 `… N more dropped`，预览仍是合法 JSON，模型还能 parse 后继续取。剪不动结构（普通长字符串）才退回按字符切。`cdp` 不再单开配置项：两者都是模型自己要的原始数据，一个预算就够。

## 发给扩展的 wire 契约

宿主发 `{ sessionKey, ...params }`，带 `tab` 时另加 `tabId`。扩展侧按 `tabId` 优先、否则按 `sessionKey` 找本会话 target。

| 动作 | 宿主带的参数 | 扩展回的形状 |
|---|---|---|
| `page.navigate` | `url`、`initScript`、`timeoutMs` | 一个标签对象，含 `id`，成功后宿主记成 target |
| `page.click` | `ref` 或 `selector` 或 `x`+`y` | `{ changed, opened? }` |
| `page.hover` | `ref` 或 `selector` 或 `x`+`y` | `{ x, y }`，悬停不改页面，不算变更量 |
| `page.type` | `text`、`replace`、`press` | `{ changed, opened? }` |
| `page.fill` | `fields`，每项带 `ref` 或 `selector` 加 `value` | `{ changed, opened? }`，`ref` 由扩展换成坐标 |
| `page.key` | `key` | `{ changed, opened? }` |
| `page.drag` | `from`、`to`、`steps` | `{ changed }` |
| `page.scroll` | `dx`、`dy`、`steps` | `{ changed }` |
| `page.upload` | `paths`、`timeoutMs`（等 file chooser） | `{ changed }` |
| `page.evaluate` | `js` | `{ value, note? }`，`note` 单独一行接在正文末尾 |
| `page.waitFor` | `kind`、`value`、`timeoutMs` | `{ waitedMs }` |
| `page.snapshot` | `mode`、`query`、`ref`、`selector`、`maxElements`、`textChars` | `{ mode, url, title, … }`，形状见 `background/page/snapshot.js` |
| `page.inspect` | `ref` 或 `selector` | `{ url, title, element }`，`element.rect` 是视口坐标 |
| `page.console.list` | `clear` | `{ records, note? }` |
| `page.network.list` | `clear` | `{ records, note? }` |
| `page.network.get` | `requestId` | 一条请求记录，带响应体 |
| `page.screenshot` | `format`、`fullPage` | `{ format, images: [{ data }] }` |
| `tab.list` | — | `{ tabs }`，每项 `{ id, active, title, url }` |
| `tab.new` | `url` | `{ id }` |
| `tab.activate` | `tabId` | `{}` |
| `tab.close` | `tabId` | `{}` |
| `cdp.call` | `method`、`params` | `{ result }` |
| `automation.cleanup` | `closeOwnTabs` | `{ closed }` |

`changed` 与 `page.snapshot` 的 `changes` 同形：`{ added, removed, updated, lines? }`。

`logs` 为空时宿主回一行 `no <kind> records captured for this tab`：空正文会让模型把「没有记录」读成「工具没输出」。抓取关闭或存储写不进时，`note` 放在记录之前。

`opened` 只在动作顺带开出新标签时出现，元素是 `{ id, active, title, url }`。宿主把它打成一行 `opened: +1 <id> [*] <标题> <url> (next: tab=<id>)` 交给模型：目标标签的 URL 不会因为新标签而变，没有这一行时「回车无效」和「回车开了新页」在结果里长得一样。行尾直接给下一轮该用的 `tab`：`chrome_tab` 的规则让模型「先列表再动手」，只给 id 不给这句，模型会为了确认 id 多调一次 `chrome_tab list`。
