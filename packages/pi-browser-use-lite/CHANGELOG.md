# CHANGELOG

本文件记录已发布版本的用户可见变更。更细的过程见 git log。破坏性变更标 **BREAKING**。

## 0.4.1 — 2026-11-09

- 给模型的提示词按兄弟包的体量重写：默认工具面从 7,710 字符降到 2,486。工具说明一句话；参数说明只写 schema 读不出的默认值、单位、副作用与名称碰撞；规则从 11 条降到 9 条。序列化预算从 12,000 收紧到 6,500。
- 错误文案同步收短。`page_error`、`bad_args`、`tab_not_found`、`tab_ambiguous`、`aborted`、`extension_version` 的 hint 只留下一步动作；`aborted` 与 `extension_version` 各自的多种说法合成一句。类别判断不变，只是文案更短。
- 规则的 `chrome_act: ` 前缀改由工具自己拼。`tools.<id>.name` 改名后规则跟着改名；`guidance.<id>.promptGuidelines` 只写句子即可。**行为变更**：写过旧前缀的配置会看到重复的工具名，删掉配置里的名字即可。

## 0.4.0 — 2026-11-09

- **BREAKING**：跨桥的错误回包从字符串变成 `{ class, message }`。宿主读 `details.error` 拿到的是对象，类别不再靠解析消息前缀。装扩展的那一侧要同步升到 0.4.0 并重新加载扩展，否则错误消息降级成一句兜底文案。
- 错误类别收敛成一处：12 个类别与各自的 hint 只有 `protocol` 一份权威表。扩展在回包时把内部前缀折成信封，桥在边界校验类别，认不出的一律归 `page_error`。

## 0.3.4 — 2026-11-09

- 点击、输入、按键、悬停、拖动、滚轮不再把浏览器窗口带到前台：页面不可见时先发 `Emulation.setFocusEmulationEnabled`，让页面自报 visible 并接受可信 CDP 输入；等 6×50ms 仍不可见才报 `page_error` 并说明原因。
- `/chrome authorize on` 第一次就干净成功：桥改在 `session_start` 起，授权命令只改策略，不再打印扩展连接状态；连接状态与装扩展三步只由 `/chrome status` 报。
- 新会话的第一个浏览器工具调用给扩展 2 秒首次轮询宽限，不再和扩展的 1 秒轮询抢跑；见过但过期的扩展仍立即报 `extension_missing`。

## 0.3.3 — 2026-11-09

- `chrome_see` 的 `text` 与 `full` 重新带上正文：此前只遍历元素节点，文本节点全部漏掉，读出来只有标题与结构。`refs` 的 500 字摘要同理。
- `chrome_act fill` 的字段可以直接用快照里的 `ref`，不必再写 `selector`；每次点击前才解析 ref 并滚进视口，前一个字段的滚动不会让后一个坐标失效。
- 陈旧 ref 不再静默点到页面左上角：元素已脱离文档时报 `ref e12 is stale; take a new snapshot`，同时清掉该引用。
- 键盘每个键成对发 `keydown` 与 `keyup`；`Ctrl+A` 这类组合键会真实按下并松开修饰键。页面用 `keyup` 做校验或挂快捷键时不再收不到事件。
- `type` 追加前先把光标移到末尾。点击落在字段中间，文字也不会插进已有内容中间。
- `drag` 按下前先把指针移到起点，靠 `:hover` 才出现的拖拽把手也能抓住。
- 视口截图不再传 `clip`：页面滚动后截的是当前视口，不是文档左上角。
- 调试器挂载会自愈：先摘掉同标签的残留会话，Chrome 短暂拒绝时重试一次。
- 标签关闭时清掉快照基线与日志缓冲；日志写存储失败不再中断抓取，读日志时附注原因。
- 轮询循环抛错后也能重新起轮，不再永久停摆。

## 0.3.2 — 2026-11-09

- 一次卡住的 CDP 调用不再让整个浏览器控制停摆：命令带 `remainingMs`，扩展到期就摘下调试器（在等的调用随之失败）、回 `timeout:`，轮询接着转。此前一条命令永不返回，后面所有命令都取不走，只能重载扩展。
- `chrome_tab list` 没有标签时回 `no tabs in this session yet`，不再回空字符串。
- 点、输入、填、按键顺带开出新标签时会报一行 `opened: +1 8 * 标题 url`。此前目标标签的 URL 不变，模型把「回车开了新页」当成「回车没生效」，又按一遍，开出三个一样的标签页。

## 0.3.1 — 2026-11-09

- `/chrome authorize on` 第一次就成功：不再要求扩展此刻已连上再授权。扩展按轮询连上来，此前命令在起桥后立刻查连接台账，那一刻还没连上，所以第一次必然报 `extension_missing` 且不授权。现在先授权，没连上时把装扩展的三步加在结果后面。

## 0.3.0 — 2026-11-09

- `/chrome authorize off` 之后五个工具真的消失：注册时按 `policy.authorizeOnStart` 决定活动状态，`authorize on` 挂上、`off` 摘掉，模型工具表与 codemode 描述一起变。此前授权只拦调用，工具定义一直在。

## 0.2.0 — 2026-11-09

- **BREAKING**：删掉 `prompt.guidelines`。默认三条规则搬进 `chrome_act` 自己的 `promptGuidelines`；跨工具的规则写 AGENTS.md。写了这个键的配置会以 `prompt: unknown key` 启动失败。
- `/chrome` 有参数补全：输入 `/chrome ` 列子命令，`/chrome authorize ` 列 on 与 off，每项带一句说明。
- 关掉某个工具后，系统提示里不再留下点名它的规则：此前全局规则里的三条 `chrome_act` 规则在关掉 `chrome_act` 后仍然保留。
- **BREAKING**：删掉 `policy.background` 与 `/chrome background`。点不动页面时由输入路径自己把标签与窗口带到前台；读操作照样不打扰。写了这个键的配置会以 `policy.background: unknown key` 启动失败。
- 输入前的可见性检查改成自救：不可见就激活标签、把窗口带到前台，仍不可见才报错并说清原因（标签非活动、窗口最小化、被盖住）。
- `chrome_tab new` 建的新标签在自己的窗口里是活动标签，不再出现「新标签点不动」。
- README 说清自动化窗口不聚焦地打开、第一次点击或打字会把它带到前台。

## 0.1.1 — 2026-11-09

- 补中文 README：`README.zh-CN.md`，英文版顶部有切换链接，npm 包同时收录两份。

## 0.1.0 — 2026-11-08

首版。

- 五个工具：`chrome_act`（navigate、click、type、fill、press、hover、drag、scroll、upload、eval、wait、batch）、`chrome_see`（refs、text、changes、full，另可取 console 与 network 日志）、`chrome_tab`（list、new、switch、close）、`chrome_vision`（截图落盘）、`chrome_cdp`（裸 CDP 调用）。
- `/chrome` 命令：`authorize on|off`、`background on|off`、`status`。扩展装好之前，命令与工具都报 `extension_missing` 并给出装扩展三步。
- 本地桥：只绑 `127.0.0.1`，多 Pi 会话共用一个服务端，其余退成客户端。扩展每 100 毫秒轮询一次。
- 每个会话一个独立的浏览器窗口：动作在本次会话的 target 里执行，别的窗口不动，退出时按配置关掉标签。
- 截图默认落在 `<agent dir>/pi-browser-use-lite/screenshots`，跟着 `PI_CODING_AGENT_DIR` 走，不写进家目录的 `~/.pi/screenshots`。
- 发布：`CHANGELOG.md` 与 `browser-extension/` 一起进 `files`。用户从 npm 装到扩展源码后 load unpacked。
- 扩展版本落后于包时自己重载一次，不必再去扩展页手动刷新。
- 轮询断了由扩展的 1 秒定时器重起；`chrome.alarms` 只作服务工作进程被回收后的兜底。
- `chrome_act eval` 省掉超长 `data` 时，说明接在正文末尾；此前这条说明到不了模型。
- 包内带 `README.md`：安装、配置、开发各一节，扩展目录由 `/chrome status` 打印。
