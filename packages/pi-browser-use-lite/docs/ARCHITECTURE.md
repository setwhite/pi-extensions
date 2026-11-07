# pi-browser-use-lite — ARCHITECTURE

本文件写模块职责、允许的依赖方向与测试 seam。模块内部签名与字段以代码与测试为准。

## 1. 模块

### 1.1 Pi 扩展侧

源码在 `src/` 下，模块以目录为单位。

| 模块 | 职责 | 契约边界 |
|---|---|---|
| `src/index.ts` | 读配置，按 `tools.*` 注册工具（默认 5 个），挂 `/chrome` 命令。`before_agent_start` 把 `prompt.guidelines` 合并进 `systemPromptOptions.promptGuidelines` | 只有扩展入口。不导出可复用 API |
| `src/config/` | 定位、加载、校验、clamp 配置文件 | 只依赖 `node:`。不碰网络与浏览器 |
| `src/protocol/` | 桥的命令与结果信封类型、动作名表、错误类别与 hint、超时常量 | 无依赖。动作名与错误 hint 是唯一来源 |
| `src/bridge/` | 本地 HTTP 桥：`/next` 长轮询、`/result`、`/command` 转发、`/status`、在途命令表、扩展版本闸。端口上先到者当 server，其余当 client 转发，owner 消失时抢端口升为 server | 只依赖 `protocol/`。不认识工具语义 |
| `src/policy/` | 三个策略插点：授权、硬背景模式、自动化 target 归属 | 依赖 `config/`。不做 IO |
| `src/tools/` | 5 个工具的定义与执行器、各自的默认 `promptGuidelines` 常量。`guidance.*` 在此覆盖文案与规则 | 组装模型可见文本的唯一处。错误文案取自 `protocol/` 的 hint |
| `src/format/` | 结构化结果转模型文本的纯函数 | 无依赖 |
| `src/fs/` | 截图落盘与按数量修剪 | 只依赖 `node:fs` |
| `src/commands/` | `/chrome` 子命令：`authorize` `status` `background` | 依赖 `bridge/`、`policy/`、`config/` |

### 1.2 Chrome 扩展侧

`browser-extension/` 有两个代码域。

`background/` 是 ES 模块，由 `manifest.json` 的 `background.type: "module"` 加载。

| 文件 | 职责 |
|---|---|
| `background/index.js` | 只注册 listener，启动轮询 |
| `background/transport.js` | 轮询循环、结果回传、请求超时、报版本头 |
| `background/dispatch.js` | 动作路由表 |
| `background/tabs.js` | 标签页查询、格式、分组、置前、导航与等加载、会话标签台账 |
| `background/target.js` | 自动化 target 归属 |
| `background/capture.js` | console 与 network 的早期捕获。在 `webNavigation.onCommitted` 时注入包装，确保从导航起就抓。契约见 SPEC-0001 的 `chrome_see` 段 |
| `background/input/debugger.js` | debugger 挂载、自愈重连、原始 CDP 调用、scripting 回退 |
| `background/input/pointer.js` | 移动、点击、悬停、拖动、滚轮 |
| `background/input/keyboard.js` | 键位表、键事件、输入、填充、按键 |
| `background/input/upload.js` | file chooser 截获、`DOM.setFileInputFiles` |
| `background/page/evaluate.js` | 在页面里求值、辅助函数注入 |
| `background/page/helpers.js` | 页面内辅助函数，按源码注入 |
| `background/page/snapshot.js` | 快照与深查的包装 |
| `background/page/screenshot.js` | 截屏 |

注入目录 `browser-extension/page/` 只放被 `executeScript({files})` 送进页面的经典脚本。文件必须自包含：不 `import`，不引用模块作用域，也不 `export`。

| 文件 | 注入方式 |
|---|---|
| `browser-extension/page/snapshot.js` | `executeScript({files})` |

辅助函数不进注入目录，放 `background/page/helpers.js`：具名导出、函数体自包含，由 `background/page/evaluate.js` 逐个 `executeScript({func})` 注入。`func` 形式的源码在 `chrome.scripting` 被拒时还能经 `Runtime.evaluate` 送进页面；注入目录的文件做不到这一点。

没有 `page/actions.js`：CDP 输入失败时不做 DOM 假事件回退（[DEC-0007](decisions/0007-drop-redundant-pieces.md)）。

## 2. 依赖方向

路径相对 `src/`。模块以目录为单位，顶层只放 `index.ts`。

规则：

- 只能沿边表依赖。`config/`、`protocol/`、`format/`、`fs/` 不 import 任何业务模块。
- `bridge/` 不认识工具语义，只搬运 action 名与参数。
- `tools/` 是唯一组装模型可见文本的地方。下层只产出结构化错误与原因片段。
- 模型文案与界面文案用英文。注释与文档用中文。

边表与「单一出口」表只写一份：本包 `scripts/import-graph.mjs`。仓库根 `scripts/check-imports.mjs` 按它执行，入口是 `pnpm check:imports`。改依赖方向时改表，本节不复述。

## 3. 目录与测试约定

- 源码 `src/`，测试 `test/`，扩展在 `browser-extension/`，文档 `docs/`。
- 参考仓库在 `_repos/`。根 `.gitignore` 已排除。`tsconfig.json` 必须 `exclude` 它。
- 发布产物 `files` 列 `src`、`browser-extension`、`CHANGELOG.md`。相对兄弟包多一项，因为用户要加载扩展。
- 其余 `package.json` 字段照 `packages/pi-todo-lite/package.json`：`pi.extensions` 指向 `./src/index.ts`，`peerDependencies` 为 `@earendil-works/pi-ai`、`@earendil-works/pi-coding-agent`、`@earendil-works/pi-tui`、`typebox`，`devDependencies` 为 `@biomejs/biome 2.5.15`、`typescript ^7.0.2`、`vitest ^5.0.5`，`scripts` 为 `lint`、`lint:fix`、`check:imports`、`test`、`typecheck`。
- 模块文档放 `docs/modules/<module>.md`。
- 真浏览器冒烟放 `test/e2e/`，不进 `pnpm test`，永不进 CI。e2e 不启动浏览器：它连一个已开着、已手动 load unpacked 装好扩展的 Chromium 系浏览器。浏览器没连上时失败并打印装扩展的三步，不 skip。挑战页由 e2e 用 `node:http` 起在 `127.0.0.1` 的临时端口上；manifest 的 `host_permissions` 不带端口，所以不用改 manifest。
- 收工 QA 四条：`pnpm lint`、`pnpm check:imports`、`pnpm test`、`pnpm typecheck`。
- e2e 实测环境：本机用 Vivaldi 8.2.4133.96（Chromium 152），路径 `D:\Vivaldi浏览器\Application\vivaldi.exe`。本机没有 Google Chrome。

## 4. 文档职责（防止重复）

| 文件 | 只写 | 不写 |
|---|---|---|
| `docs/specs/` | 契约：工具、参数、命令、配置字段、错误类别、结果信封、非功能上限 | 模块划分、任务拆分、决策理由 |
| `docs/ARCHITECTURE.md` | 模块职责、依赖方向、目录与测试约定、seam 清单、本表 | 模块内部签名与字段 |
| `docs/GLOSSARY.md` | 术语的唯一命名来源 | 实现细节 |
| `docs/decisions/` | 背景、决定了什么、为什么、砍了什么 | 字段表、契约细节 |
| `docs/research/` | 外部世界的实测数据 | 本包的契约与决策 |
| `docs/todos/` | 任务与验收、阶段台账 | 契约与理由 |
| `docs/modules/<module>.md` | 该模块的取舍、坑与指针 | 其它模块的内容；代码或测试已表达的 API、契约、默认值 |
| `CHANGELOG.md` | 各版本的用户可见变更 | 契约与理由 |

内容归属冲突时以本表裁决。跨文档只允许指针，不允许复述内容。

`docs/decisions/` 一条一文件，编号即顺序。新决策取最大号加一。改其中一条时新开一条，并在旧条注明取代关系。删减项不新开文件，追加进 [0007](decisions/0007-drop-redundant-pieces.md)。

改完文档自查四项：契约有主人、模块有任务、AC 编号连续、没有死链。

## 5. seam 清单

测试只写在这些 seam 上。

| seam | 位置 | 观察方式 |
|---|---|---|
| 工具定义 | `src/tools/index.ts` 导出的 5 个定义 | 序列化后量字符数、查 schema 字段 |
| 工具执行 | `src/tools/` 的执行器，桥用桩 | 给参数与桩返回值，看 `content` 与 `details` |
| 配置解析 | `src/config/index.ts` 的 `loadConfig` | 给临时 agent 目录，看返回值或抛错 |
| 桥端点 | `src/bridge/` 起的真 HTTP 服务 | 发真请求，看状态码与 JSON |
| 桥 lifecycle | `src/bridge/` 的桥实例 | 停服后或 client 模式下看状态与发命令的结果 |
| 策略判定 | `src/policy/` 的判定函数 | 给状态与调用参数，看是否拒绝 |
| 扩展启动 | `browser-extension/background/index.js` 的模块加载 | 挂 `globalThis.chrome` 桩后动态 `import()`，看注册的 listener 与是否抛错 |
| 扩展轮询 | `browser-extension/background/transport.js` 的 `startTransport` | 起本地 HTTP 桩服务或真桥，看它发出的请求、dispatch 调用与回传的结果 |
| 扩展动作路由 | `browser-extension/background/dispatch.js` 的 `dispatch(action, params)` | 挂 `globalThis.chrome` 桩，看返回值与调用记录 |
| 调试器通道 | `browser-extension/background/input/debugger.js` 的调试器接口 | 挂 `chrome.debugger` 桩，看 attach 次数、发出的 CDP 消息与抛错 |
| 标签页管理 | `browser-extension/background/tabs.js` 的导出函数 | 挂 `chrome.tabs`、`chrome.tabGroups`、`chrome.storage` 桩，看返回值与调用记录 |
| 指针事件 | `browser-extension/background/input/pointer.js` | 挂调试器桩，看 CDP 事件序列与坐标 |
| 键盘输入 | `browser-extension/background/input/keyboard.js` | 挂调试器桩，看按键事件与 `Input.insertText` |
| 文件上传 | `browser-extension/background/input/upload.js` | 挂 `chrome.debugger` 桩，看 `DOM.setFileInputFiles` 的参数 |
| 页面求值 | `browser-extension/background/page/evaluate.js` | 挂 `chrome.scripting` 与调试器桩，看求值结果与回退路径 |
| 页面快照 | `browser-extension/background/page/snapshot.js` | 固定页面脚本的返回值，看 4 个模式的输出 |
| 截屏 | `browser-extension/background/page/screenshot.js` 与 `src/fs/` | 给视口尺寸与假图，看落盘文件、文件名与修剪结果 |
| 日志捕获 | `browser-extension/background/capture.js` | 挂 `chrome.webNavigation` 与页面桩，看日志条目 |
| 目标隔离 | `browser-extension/background/target.js` | 挂 `chrome.storage.session` 与 `chrome.storage.local` 桩，看每个 sessionKey 的 target |
| `/chrome` 命令 | `src/commands/` 的子命令处理函数 | 给桥桩，看打印文本与会话状态 |
| 页面脚本自包含 | `browser-extension/page/*.js` | 静态扫描源码，断无 `import`、`export`、`require`、动态 `import()` |
