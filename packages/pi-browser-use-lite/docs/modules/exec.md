# exec

`src/tools/exec/`、`src/tools/result.ts`、`src/tools/errors.ts`、`src/format/`

## 取舍

- 宿主每条命令都带 `sessionKey`，取 `ctx.sessionManager.getSessionId()`：target 台账在扩展侧、按会话分，宿主没有第二个 id 可用。换会话就换 key，所以 target 自然隔离。
- `tab` 参数（id、URL 子串、标题子串）在宿主解析成 `tabId`：`tab_not_found` 与 `tab_ambiguous` 的候选文案是模型可见文本，按 ARCHITECTURE §2 只能由 `tools/` 组装。代价是带 `tab` 的一次调用多一条 `tab.list`。
- 变更量由扩展在同一次动作里给（`changed: { added, removed, updated }`）：diff 与基线都在扩展侧，宿主再发一次快照会把「一次交互」拆成两条命令，且两次快照之间的变化归属不清。
- 错误分类收在一个 `classify()`：桥抛的 `BridgeError` 认自己的类别，扩展抛的 `<class>: …` 认前缀，其余归 `page_error`。5 类 hint 从 `protocol/` 展开，不抄第二份。
- 扩展没轮询过时直接报 `extension_missing`，不等到 30 秒超时：`/next` 没人取，命令只会在队列里躺着。
- `batch` 用一次调用的预算（30 秒）分给各步：每步的超时取剩余时间，超预算就停在当时那一步并报 `timeout`。
- 截图的落盘函数可注入，默认 `src/fs/` 的实现：扩展只回 base64，写盘与修剪归宿主，测试因此不用碰磁盘。

## 发给扩展的 wire 契约

宿主发 `{ sessionKey, ...params }`，带 `tab` 时另加 `tabId`。扩展侧按 `tabId` 优先、否则按 `sessionKey` 找本会话 target。

| 动作 | 宿主带的参数 | 扩展回的形状 |
|---|---|---|
| `page.navigate` | `url`、`initScript`、`timeoutMs` | 一个标签对象，含 `id`，成功后宿主记成 target |
| `page.click` | `ref` 或 `selector` 或 `x`+`y` | `{ changed }` |
| `page.hover` | `ref` 或 `selector` 或 `x`+`y` | `{ x, y }`，悬停不改页面，不算变更量 |
| `page.type` | `text`、`replace`、`press` | `{ changed }` |
| `page.fill` | `fields` | `{ changed }` |
| `page.key` | `key` | `{ changed }` |
| `page.drag` | `from`、`to`、`steps` | `{ changed }` |
| `page.scroll` | `dx`、`dy`、`steps` | `{ changed }` |
| `page.upload` | `paths`、`timeoutMs`（等 file chooser） | `{ changed }` |
| `page.evaluate` | `js` | `{ value, note? }`，`note` 单独一行接在正文末尾 |
| `page.waitFor` | `kind`、`value`、`timeoutMs` | `{ waitedMs }` |
| `page.snapshot` | `mode`、`query`、`ref`、`selector`、`maxElements`、`textChars` | `{ mode, url, title, … }`，形状见 `background/page/snapshot.js` |
| `page.inspect` | `ref` 或 `selector` | `{ url, title, element }`，`element.rect` 是视口坐标 |
| `page.screenshot` | `format`、`fullPage` | `{ format, images: [{ data }] }` |
| `tab.list` | — | `{ tabs }`，每项 `{ id, active, title, url }` |
| `tab.new` | `url` | `{ id }` |
| `tab.activate` | `tabId` | `{}` |
| `tab.close` | `tabId` | `{}` |
| `cdp.call` | `method`、`params` | `{ result }` |
| `automation.cleanup` | `closeOwnTabs` | `{ closed }` |

`changed` 与 `page.snapshot` 的 `changes` 同形：`{ added, removed, updated, lines? }`。
