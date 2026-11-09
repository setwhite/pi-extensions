# 0001 浏览器控制工具面与模块化

## 问题

pi-chrome 有 23 个工具，实测占 19,151 字符（[RESEARCH-0001](../research/0001-tool-surface-cost.md)）。模型要在 23 个近似工具里选，公共参数在每个工具里重复声明。

代码是三个源文件共 6,323 行。`service_worker.js` 单文件 3,481 行，约 151 个函数。改动时难定位，测试难隔离。

## 方案

以 pi-chrome v0.15.57 为底本删减，不从零重写（[DEC-0010](../decisions/0010-pi-chrome-as-base.md)）。

工具面收束到 5 个分派器式工具。名单固定不变，但可逐个关闭或改名（[DEC-0011](../decisions/0011-fixed-tool-surface.md)、[DEC-0009](../decisions/0009-tool-switches-and-prompts.md)）。代码按职责拆成模块：Pi 扩展侧按目录，Chrome 扩展侧按两个代码域。

链路不变：Pi 扩展 → 本地桥 → Chrome 扩展 → 页面。输入走 `chrome.debugger` 的受信任事件，失败直接报错，不回退页面内合成事件（[DEC-0012](../decisions/0012-trusted-input-via-debugger.md)）。

## 用户故事

- 作为使用已有 Chrome 登录态的 Pi 用户，我要 Pi 直接操作我的真实浏览器，以便不必重登任何站点。
- 作为 Pi 用户，我要工具少而全，以便模型一次选对，且不占太多 context。
- 作为 Pi 用户，我要模型在点击前先看页面拿到 ref，以便不靠猜坐标。
- 作为 Pi 用户，我要操作返回判定与页面增量，以便知道做成了没有。
- 作为 Pi 用户，我要授权可控，以便在我不在时锁住浏览器控制。
- 作为 Pi 用户，我要一条命令看到当前状态，以便不用猜为什么工具不可用。
- 作为维护者，我要配置只覆盖真会改的旋钮，以便文档与测试不膨胀。
- 作为 Pi 用户，我要读操作不抢我的前台，只有真点击与打字才把浏览器带到前面，以便一边看一边干活。
- 作为 Pi 用户，我要每个会话独占自己的浏览器窗口，以便分清哪些标签是 Pi 开的。
- 作为 Pi 用户，我要多个会话或子代理共用一条 Chrome 连接，以便并发任务都能用浏览器。
- 作为 Pi 用户，我要输入事件受信任，以便能操作有反自动化检测的站点。
- 作为 Pi 用户，我要在严格 CSP 站点上也能求值和快照，以便不被 `script-src` 挡住。
- 作为 Pi 用户，我要原始 CDP 逃生口，以便专用工具覆盖不到时还能干活。
- 作为 Pi 用户，我要能看 console 与网络请求，以便调试页面问题。
- 作为 Pi 用户，我要控制台与网络捕获从导航开始，以便早期错误不丢。
- 作为维护者，我要源码按职责分模块，以便改动只碰一处。
- 作为维护者，我要依赖方向由脚本强制，以便分层不被慢慢破坏。
- 作为维护者，我要工具面体积有回归守卫，以便后续加能力时不悄悄变贵。
- 作为 Pi 用户，我要关掉用不上的工具、替换工具文案与规则，以便工具面贴合我自己的用法。
- 作为维护者，我要配置有统一契约，以便与本仓库其它包一致。
- 作为维护者，我要页面注入代码有自包含检查，以便拆分后不会线上才炸。

## 实现决定

### 工具面

5 个工具。公共参数只有 `tab`（可选字符串：标签页 id、URL 子串或标题子串）。不带 `tab` 时作用于本会话的自动化 target。

按配置注册：可逐个关闭，可改名，可整段替换文案（见「工具开关与提示词」）。默认全开，名字不变。

`host` 写死 `127.0.0.1`。`port` 移进配置文件。`background` 不要：页面不可见时由输入路径自己把页面带到前台。`promptSnippet` 默认不发。

**`chrome_act`** — 交互分派器。`action` 必填。共享参数只有 `see`：值为 `chrome_see` 的 `mode`，动作完成后附一次快照。

| action | 关键参数 | 行为 |
|---|---|---|
| `navigate` | `url`、`init_script` | 导航并等加载 |
| `click` | `ref` / `selector` / `x`+`y` | 真实鼠标点击 |
| `type` | `text`、`replace`、`press` | 追加；`replace` 先清空 |
| `fill` | `fields` | 逐字段整体替换 |
| `press` | `key` | 单键或组合键。组合键写成 `Ctrl+A` |
| `hover` | `ref` / `selector` / 坐标 | 指针移动 |
| `drag` | `from_*`、`to_*` | 指针拖拽 |
| `scroll` | `dy`、`dx` | 滚轮事件 |
| `upload` | `paths` | 截获 file chooser |
| `eval` | `js` | 页面求值 |
| `wait` | `kind`、`value`、`timeout_ms` | `kind` 取 `selector` / `expression` / `text` |
| `batch` | `steps` | 顺序执行；步骤可带 `optional` |

**`chrome_see`** — 读取。`mode` 取 `refs`（默认）、`text`、`changes`、`full`。

| mode | 给什么 | 默认上限 |
|---|---|---|
| `refs` | 标题、500 字摘要、标题树、元素、表单状态、hints、变化 | 元素 80 个。不给正文 |
| `text` | 标题树在前，正文在后 | 18,000 字符 |
| `changes` | 只给上次快照之后的差异 | 600 字符 |
| `full` | 全部字段，含布局与正文 | 30,000 字符 |

`refs` 不带正文。这是默认值。省 token 主要靠这一条。

`changes` 只比元素的三元组：标签、角色、可见文本。只报增、删、改。不报位置移动。上限 20 条。

`changes` 的输出不超过 600 字符。超出时从上到下逐条丢弃，末行注明丢弃条数。

| 参数 | 作用 |
|---|---|
| `query` | 按自然语言查找并排序，返回 ref |
| `ref` | 深查单个元素 |
| `selector` | 按 CSS 选择器深查单个元素 |
| `logs` | `console` 或 `network` |
| `request_id` | 取单条请求详情 |
| `clear` | 读完清空该日志 |

日志按标签页各存一份，从该标签页本次导航的 `webNavigation.onCommitted` 起抓，跨后续同标签页的导航保留，直到 `clear`。`console` 记级别、文本、时间，上限 500 条，满了丢最旧的。`network` 记方法、URL、状态、耗时，上限 1,000 条，满了丢最旧的。请求体与响应体各截到 200,000 字符。`request_id` 取单条详情。抓不到就往 `logs` 的头部写一行说明，不阻塞导航。

抓取从本扩展接管标签起生效：`tab.new` 带 `url` 时页面已在加载，页头最早执行的脚本可能赶不上。

**`chrome_tab`** — `action` 取 `list`、`new`、`switch`、`close`。`switch` / `close` 需要 `tab`。`tab` 命中多个标签时报错，列最多 5 个候选。

**`chrome_vision`** — 截屏。参数 `full_page`，加公共的 `tab`。格式取 `screenshot.format`，路径自动生成在 `screenshot.dir` 下。

- 不传 `full_page`：当前视口一张图。
- `full_page: true`：一张整页图，用 CDP 的 `captureBeyondViewport`。不拼图，不写别的文件。
- 整页高度超过 4 倍视口：改按屏截，出 N 张正常尺寸的图，文件名带 `-1of3` 序号。

结果落盘，`content` 只给文件路径，`details.path` 同值。不回传 base64 图片。pi 的工具结果支持 image 块，但整页截图体积大，按 token 计费不划算。要看图时由模型用 `read` 打开路径，`read` 会把图片转成 image 块。长图会被视觉模型缩到固定尺寸，字会糊。要读细节时读分块里的某一张。

**`chrome_cdp`** — 原始 CDP 逃生口。`method` 必填，`params` 可选。在目标标签页上调用。不列举 target；要看标签用 `chrome_tab` 的 `list`。

### 结果信封

每个工具返回 `{ content, details }`。`content` 是给模型读的英文文本，超过 32,000 字符截断，并在末尾注明截了多少。`details` 放结构化数据，供 TUI 渲染与测试断言。

`content` 的形状按工具定死：

| 工具 | `content` | `details` |
|---|---|---|
| `chrome_act` 的交互类 | 判定行（`ok: click ref=e12`）、变更行（`changed: +1 -0 ~2`）、可选快照 | `{ ok, action, changed: { added, removed, updated }, snapshot?, ref? }` |
| `chrome_act` 的 `eval`、`wait` | 判定行，接返回值（`eval` 给 JSON 或文本，`wait` 给耗时） | `{ ok, action, value? }` |
| `chrome_see` | 该 `mode` 的正文 | `{ mode, url, title, elements?, text?, changes?, truncated }` |
| `chrome_tab` 的 `list` | 每行一个标签：id、`*` 表示活动页、标题、URL | `{ tabs }` |
| `chrome_tab` 其余动作 | 一行结果 | `{ result }` |
| `chrome_vision` | `Saved <path>`。分块时每个文件一行 | `{ path, tiles? }` |
| `chrome_cdp` | 返回值的 JSON | `{ result }` |

变更量是元素三元组的计数：标签、角色、可见文本。比较器与 `chrome_see` 的 `changes` 共用一份实现。变更量只给数字，不给明细。要明细就在 `chrome_act` 里传 `see: changes`。

### 错误

错误消息是 `/chrome doctor` 的替代品。删掉 `doctor` 的依据就是这张表。所以每条错误必须分类，并给出下一步。

格式：第一行 `<class>: <一句话原因>`，第二行 `hint: <下一步动作>`。`details.error` 放 `{ class, message, hint }`。

| `class` | 触发条件 | `hint` |
|---|---|---|
| `locked` | 未授权 | `Run /chrome authorize on` |
| `bridge_unreachable` | 桥没起，或端口被别的进程占 | `Run /chrome status`，或改 `bridge.port` |
| `extension_missing` | 桥在，但没有扩展轮询 | 打印装扩展的三步 |
| `extension_version` | 扩展版本与宿主不匹配 | 等一秒：扩展会自己重载；仍失败说明磁盘上是旧代码 |
| `no_target` | 本会话还没有自动化 target | 先 `chrome_act navigate` 或 `chrome_tab new` |
| `tab_not_found` | `tab` 参数匹配 0 个标签 | 列出最多 5 个候选 |
| `tab_ambiguous` | `tab` 参数匹配多个标签 | 列出最多 5 个候选 |
| `bad_args` | 参数不合法，例如缺定位方式、`batch` 超过 50 步 | 指出该补哪个参数 |
| `timeout` | 三种失败原因：扩展没在轮询、轮询了没取走、取走后没回结果 | `Run /chrome status` |
| `cdp_unavailable` | debugger 挂不上，被别的调试器或其它扩展 target 占用 | 关掉该页的开发者工具或密码管理器扩展 |
| `page_error` | 页面内求值或注入抛错 | 给原始消息的首行 |
| `aborted` | 调用方取消 | `retry if you still need the result` |

每条消息要能单独读懂，不依赖上文。模型拿到 `hint` 就能自己恢复。

### 桥协议

沿用 pi-chrome 的四个端点。

| 端点 | 用途 |
|---|---|
| `GET /next` | Chrome 扩展长轮询取命令。挂起 25 秒 |
| `POST /result` | Chrome 扩展回传结果 |
| `POST /command` | 其它 Pi 进程转发命令给 owner |
| `GET /status` | 报告 owner 的连接状态 |

串行。同一进程内的命令按发起顺序入队。一次只投递一条：扩展一次 `GET /next` 只取一条。不做并发。`/status` 的在途命令数就是队列长度。超时从入队时刻算，不从扩展取走时刻算。

多会话保留（[DEC-0003](../decisions/0003-bridge-multi-session.md)）：先绑端口的进程当 server，其它进程当 client 转发。owner 不可达时 client 抢占端口升为 server。

### 策略

| 策略 | 行为 |
|---|---|
| 授权 | `/chrome authorize on` 与 `off`。工具注册为不活动，授权后才进模型工具表与 codemode 描述，`off` 再摘掉。生效到会话结束，会话结束时自动关。状态只在内存，不落盘。`policy.authorizeOnStart` 为 `true` 时启动即授权。锁覆盖全部 5 个工具，只读的 `chrome_see`、`chrome_vision` 也要解锁——读页面等于读用户的隐私 |
| 目标隔离 | 每个 Pi 会话一个浏览器窗口，窗口里放本会话的自动化 target。认「这是本会话的标签」要两条同时成立：它是台账里的 target，且它在本会话的窗口里。台账存扩展的 `storage.session` 与 `storage.local`，浏览器启动时整份作废——标签 id 与窗口 id 都会被重新分配。会话结束只关本会话创建的标签；`policy.closeOwnTabsOnExit` 为 `false` 时保留 |

### 配置

文件 `<agent dir>/pi-browser-use-lite/config.json`。`PI_CODING_AGENT_DIR` 覆盖 agent 目录，否则 `~/.pi/agent`。

| 字段 | 默认值 | 何时会改 |
|---|---|---|
| `bridge.port` | `17318` | 端口被占 |
| `policy.authorizeOnStart` | `false` | 不想每会话敲授权 |
| `policy.closeOwnTabsOnExit` | `true` | 想在会话结束后继续用那些标签 |
| `input.dragSteps` | `10` | 滑块、排序拖不动 |
| `input.scrollSteps` | `5` | 无限滚动页滚不动一屏 |
| `timing.navigateTimeoutMs` | `15000` | 网站慢，导航老超时 |
| `output.maxElements` | `80` | 元素太多，context 吃不消 |
| `output.textChars` | `18000` | 正文太长 |
| `screenshot.dir` | `<agent dir>/pi-browser-use-lite/screenshots` | 想换盘 |
| `screenshot.format` | `"png"` | 想省磁盘，换 jpeg |
| `screenshot.keepNewest` | `20` | 截图占满磁盘 |
| `tools.<id>.enabled` | `true` | 用不上某个工具，省掉它的说明 |
| `tools.<id>.name` | 工具原名 | 与别的扩展撞名 |
| `guidance.<id>.description`、`.promptSnippet`、`.promptGuidelines` | 内置文案 | 想改工具自己的说法与规则 |

11 个标量字段，加 `tools`（5 个工具 × 2 项）与 `guidance`（5 个工具 × 3 项）两个记录。

文件缺失取全默认值。JSON 损坏或字段非法抛 `Error`，消息带文件路径与字段路径。数值越界只 clamp，枚举越界取默认值。

加载一次：扩展加载时读。改完要重启 pi。

`bridge.host` 不开放。写死 `127.0.0.1`。

### 工具开关与提示词

```json
{
  "tools": {
    "chrome_act":    { "enabled": true, "name": "chrome_act" },
    "chrome_see":    { "enabled": true, "name": "chrome_see" },
    "chrome_tab":    { "enabled": true, "name": "chrome_tab" },
    "chrome_vision": { "enabled": true, "name": "chrome_vision" },
    "chrome_cdp":    { "enabled": true, "name": "chrome_cdp" }
  },
  "guidance": {
    "chrome_act": {
      "description": "Drive the browser: click, type, navigate.",
      "promptSnippet": "Drive Chrome",
      "promptGuidelines": ["chrome_act: take a see snapshot before clicking by ref."]
    }
  },
}
```

规则：

- 5 个全关会抛错。至少留一个。
- `name` 匹配 `^[a-z][a-z0-9_]{0,31}$`。撞宿主内置名（`bash`、`edit`、`find`、`grep`、`ls`、`read`、`write`、`powershell`、`tool_search`）抛错，消息含 `reserved`。两个工具同名抛错，消息含 `same name`。
- 关掉的工具不进工具面，它的规则也一起消失。这是 `promptGuidelines` 的行为，不用额外写过滤。
- `guidance` 只认三个字段：`description`（工具说明）、`promptSnippet`（工具清单里的一行）、`promptGuidelines`（追加到系统提示的规则数组）。`""` 与 `[]` 表示清空。
- 没有单独的 primer。给模型的 Chrome 使用说明全部写成该工具的 `promptGuidelines`，默认内置，`guidance.<id>.promptGuidelines` 整段替换。跨工具的规则不进配置，写 AGENTS.md。
- 规则平铺进系统提示的 `<rules>` 段，pi 按原文去重，不加工具前缀。所以每条规则必须点名工具，形如 `chrome_act: ...`。
- 12,000 字符预算按默认配置断言。覆盖后不拦。

### 命令

| 命令 | 作用 |
|---|---|
| `/chrome authorize on`、`off` | 开关授权。`on` 时先查桥的连接台账；没连上就打印装扩展的步骤，且不授权 |
| `/chrome status` | 报版本、授权、桥角色、端口、连接状态、在途命令数、本会话 target。不探测页面 |

没有 `doctor`，没有 `onboard`。诊断信息由错误消息给出。装扩展的步骤由 `authorize` 与 `status` 在未连接时打印。

### 扩展结构

见 [ARCHITECTURE.md](../ARCHITECTURE.md) §1.2。`background/` 是 ES 模块，`page/` 两个文件自包含。

以下动作不进工具面，只由内部调用：`tab.version`（连接握手时对版本号）、`automation.cleanup`（会话结束）。

### 非功能

- 工具面序列化体积 ≤ 12,000 字符（默认配置）。其中 5 个工具的 `description` 合计 ≤ 4,000 字符，参数描述合计 ≤ 5,500 字符。
- 单次工具调用超时 30 秒。`navigate` 按 `timing.navigateTimeoutMs` 加 2 秒。整页截图 120 秒。
- 快照：`refs` 摘要 500 字符、元素 80 个；`text` 18,000 字符；`full` 30,000 字符。`content` 截断线 32,000 字符，比 `full` 留 2,000 字符信封余量。console 500 条。请求体 200,000 字符。
- 写死但配置可覆盖：拖动 10 步（`input.dragSteps`）、滚动 5 步（`input.scrollSteps`）、导航 15 秒（`timing.navigateTimeoutMs`）。
- 整页截图高度超过 4 倍视口时按屏分段。
- 写死且不可配置：`wait` 轮询间隔 250 毫秒、`eval` 等 Promise、网络默认保留跨导航请求。
- `wait` 默认超时 15 秒。`batch` 最多 50 步。
- `bridge.port` 被非本进程占用时启动抛错，错误类别 `bridge_unreachable`，hint 指向改端口。不静默换端口。
- Node ≥ 22.19.0。Chrome ≥ 91（模块 service worker）。轮询断了由扩展的 1 秒定时器重起；`chrome.alarms` 的 0.5 分钟周期是服务工作进程被回收后的兜底，Chrome 91–119 会把它夹到 1 分钟。
- 扩展版本与宿主不一致时，扩展从 `/next` 应答头 `x-pi-browser-use-host-version` 读到期望版本，自己重载一次。重载后仍不一致就报 `extension_version`，不反复重载。
- 浏览器要实现 `chrome.windows.create`：每个会话的自动化标签放在自己的窗口里。不依赖标签组，所以对 `chrome.tabs.group` 的实现不作要求（Vivaldi 8.2 的那一个是空操作）。
- 可信输入要求页面可见：标签页被别的标签盖住、或窗口被别的窗口盖住时，Chrome 丢弃 CDP 输入。所以每次输入前先探测可见性，不可见就激活标签、把窗口带到前台，仍不可见才报错。
- 安全：桥只绑 `127.0.0.1`。`/command` 只接受本机进程。`/next` 与 `/result` 校验浏览器来源。扩展的 `host_permissions` 用不带端口的 `http://127.0.0.1/*`，所以改 `bridge.port` 不必改 manifest、不必重装扩展。扩展侧的轮询地址在 `background/transport.js` 的 `BRIDGE_URL`，改端口时要一起改。

## 测试决定

按 [ARCHITECTURE.md](../ARCHITECTURE.md) §5 seam 清单测。

- 工具定义：序列化后量体积、查 schema。先例 `pi-web-search-lite` 的 `test/index.test.ts` 断言工具名与描述。
- 配置解析：给临时目录。先例本仓库 `pi-web-search-lite` 的 `test/config.test.ts`。
- 桥端点：起真 HTTP 服务发真请求。先例 pi-chrome `bridge-resilience.test.mjs`，改写为 vitest。
- 策略判定：给授权状态。先例 pi-chrome `automation-target.test.mjs`。
- 扩展动作路由：挂 `globalThis.chrome` 桩后动态 `import`。先例 pi-chrome `input-reliability.test.mjs`，从 `node:vm` 改为模块导入。
- 页面脚本自包含：静态扫描源码。无先例，新增。

## 不做的

- 不做自有浏览器，不用远程调试端口。只用用户已登录的真实 profile。
- 不做 cookie、storage、session 的读写（pi-chrome 没有这类能力）。
- 不做 bladebro 的 `run`（if/while 分支脚本）。`batch` 只做顺序执行。
- 不做 bladebro 式的按轮次收紧的输出预算。
- 不做响应落盘分页（`artifact` 机制）。
- 不改动 `_repos/` 下的参考仓库。
- 不引入任何新依赖，不加构建步骤。

### 不做的参数

pi-chrome 有、本版不做的参数。逐个判过，不是遗漏。

| 参数 | 原属工具 | 不做的理由 |
|---|---|---|
| `containingText`、`roleFilter` | `chrome_snapshot` | 不做参数。`query` 是 token 打分匹配，命中整串时额外加分，已覆盖 |
| `maxTextChars` | `chrome_snapshot` | 不做参数。配置 `output.textChars` 覆盖 `text` 的上限 |
| `scrollIntoView` | `chrome_inspect` | 用 `chrome_act` 的 `scroll` 加 `selector` 表达 |
| `modifiers` | `chrome_key` | `press` 直接收 `Ctrl+A` 写法，比多一个数组参数便宜 |
| `perCharacter` | `chrome_type`、`chrome_fill` | 默认路径对普通输入框就是逐字符；`insertText` 只用于 contenteditable |
| `submit` | `chrome_fill` | 用 `press` 发 `Enter` |
| `maxElements`（附快照用）、`maxElements`（快照用） | 全部交互工具、`chrome_snapshot` | 不做参数。配置 `output.maxElements` 覆盖 |
| `steps` | `chrome_drag`、`chrome_scroll` | 不做参数。配置 `input.dragSteps` 与 `input.scrollSteps` 覆盖 |
| `domFallback` | `chrome_click`、`chrome_fill`、`chrome_upload` | 删。假事件会被风控识别，失败直接报错 |
| `nearUid` | `chrome_snapshot` | 删。`query` 已覆盖距离排序的用途 |
| `intervalMs` | `chrome_wait_for` | 写死 250 毫秒 |
| `awaitPromise` | `chrome_evaluate` | 默认等 Promise |
| `timeoutMs`（导航用） | `chrome_navigate` | 不做参数。配置 `timing.navigateTimeoutMs` 覆盖 |
| `includePreservedRequests` | `chrome_list_network_requests` | 默认保留跨导航请求 |
| `path`、`format`、`quality` | `chrome_screenshot` | 不做参数。路径自动生成，格式进 `screenshot.format` |
| `retentionDays` | `chrome_screenshot` | 不做参数。只留 `screenshot.keepNewest` 一条修剪策略 |
| `port`、`userDataDir`、`useDefaultProfile`、`headless` | `chrome_launch` | 原文即 `"Ignored."`。工具已删 |
| `promptSnippet` | 全部 23 个工具 | 默认不发。需要时用 `guidance.<id>.promptSnippet` 覆盖 |
| `background` | 19 个工具 | 不要参数。不可见时输入路径自己把页面带到前台 |
| `host`、`port` | 31 处 | 进配置文件 |
| `targetId`、`urlIncludes`、`titleIncludes` | 各 22 处 | 并成单个 `tab` |
