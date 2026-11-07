# pointer

`browser-extension/background/input/pointer.js`：移动、点击、悬停、拖动、滚轮。

## 取舍

- 不做 DOM 假事件回退（DEC-0007）。
- `ref` 的解析归快照（T17），接线归 dispatch（T22）。pointer 只收 `selector` 或坐标：快照还没生成时没有 ref 可解，收到就抛 `bad_args`。
- 配置值（`input.dragSteps`、`input.scrollSteps`）随命令传入，扩展侧不留默认值：默认值只在 `src/config/schema.ts` 一份。
- 不可见标签直接抛错（`page_error`），不调 `chrome.tabs.update` 激活：背景模式禁止抢前台，切不切由调用方决定。可见性读不到也算错误，不当作可见。
- 点击坐标取元素矩形中心，不加随机偏移：断言与回放要可复现。
- 拖动没有「先移到起点」的一步：`mousePressed` 就是第一步，中间 `mouseMoved` 的次数等于配置步数。
- 滚轮落在视口中心，位移平分到每次事件：页面级滚动不需要精确坐标，中心点避开固定头部。
- 可见性探针只有一份：`assertVisible` 导出给 keyboard.js 用。页面求值用 debugger.js 的 `evaluate`，不在这里再实现一份。
- 错误前缀分两类：调用方写错参数是 `bad_args`，页面状态不配合是 `page_error`。宿主按前缀分类。
