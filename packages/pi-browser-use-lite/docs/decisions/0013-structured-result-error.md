# 0013 结果信封带结构化错误类别

## 问题

`POST /result` 的 `error` 只有一个字符串。类别只能写成消息前缀 `<class>: `，再由宿主用正则猜回来。类别表因此分两处：`protocol/` 管桥自己发的 5 类，`tools/errors.ts` 补其余 7 类。扩展说不出「这不是 `page_error`，是 `cdp_unavailable`」，只能指望前缀被正确解析。

## 选项

1. 保持字符串前缀，只把类别表合并到一处。
2. `error` 改成 `{ class, message }`，类别随信封过桥。
3. 扩展抛自定义 Error 子类，桥原样透传。

## 选了

2。

- 类别在过桥那一刻就是数据，不依赖解析约定。前缀写错会静默降级成 `page_error`，而模型据此决定要不要关 DevTools。
- 12 类与 hint 全部收进 `protocol/`。[ARCHITECTURE](../ARCHITECTURE.md) §1 早就把「错误类别与 hint」划给它，这个改动让那句话成立。`tools/errors.ts` 只剩 `classify()`。
- 扩展内部仍用 `<class>: ` 前缀抛错。约 50 处，分布在 13 个文件。解析只有一处：`transport.js` 的 `failure()`。改 50 个 throw 换不来更多信息，还给 13 个模块各加一个 import。
- 桥把类别当不可信输入校验：认不出就归 `page_error`。旧版扩展不回结构化错误，版本闸让两端不会长期错配。

砍掉 3：注入页面上下文的脚本要跨 `executeScript` 序列化，`class` 字段过不去。多一层约定不划算。

## 代价

- 前缀约定留了下来，只是解析点从宿主挪到 transport。一条静态扫描测试守着：前缀不在表里就红。
- `fs/` 这类叶子模块按依赖边表不能 import `protocol/`，继续靠前缀表达 `bad_args`。`classify()` 的正则因此不能删。
