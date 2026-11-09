# pi-browser-use-lite

**[简体中文](README.zh-CN.md)** | [English](README.md)

五个 `chrome_*` 工具，操作你自己的浏览器：你已经登录的标签页、你的 cookie 和会话。

包分两半。pi 扩展注册这些工具，并在 `127.0.0.1` 上跑一个本地桥。配套的 Chrome 扩展轮询这个桥，用 `chrome.debugger` 执行每条命令。

## 工具

| 工具 | 做什么 |
|---|---|
| `chrome_act` | navigate、click、type、fill、press、hover、drag、scroll、upload、eval、wait、batch |
| `chrome_see` | 快照：refs、text、changes、full；读控制台与网络日志 |
| `chrome_tab` | list、new、switch、close |
| `chrome_vision` | 截视口或整页 |
| `chrome_cdp` | 一条裸 CDP 调用，另四个盖不住的用它 |

值得知道的行为：

- 每个会话一个独立浏览器窗口。工具不碰你自己的标签页。会话结束时关掉本会话开的标签。
- 这个窗口不聚焦地打开。第一次点击或打字会把它带到前台，因为 Chrome 丢掉不可见页面的输入。读操作不会打扰你。
- 输入走可信 CDP 事件，拒绝合成事件的页面也会响应。
- 控制台与网络抓取从导航开始，不从第一次读取开始。
- 每次失败都带类别和一句 `hint`，说明下一步做什么。

## 安装

```bash
pi install npm:pi-browser-use-lite
```

扩展就在包里。每个浏览器装一次：

1. 在 pi 里运行 `/chrome status`。扩展没连上时，回复会打印要加载的目录。
2. 打开 `chrome://extensions`，开开发者模式，点「加载已解压的扩展程序」，选那个目录。
3. 再跑一次 `/chrome status`。`connected: yes` 表示桥看到了扩展。

然后给这次会话授权：

```
/chrome authorize on
```

授权随会话结束。想省这一步，把 `policy.authorizeOnStart` 设为 true。输入 `/chrome ` 再按 Tab 列出子命令。

## 配置

一个 JSON 文件：`<agent dir>/pi-browser-use-lite/config.json`。agent dir 是 `PI_CODING_AGENT_DIR`，没设时是 `~/.pi/agent`。

没有这个文件时全部取默认值。类型错或未知键会让启动失败，并一次列出所有坏字段。枚举值不认识时取默认值。数字越界时夹到最近的边界。下面的注释只作解释，真正的文件必须是严格 JSON。

**最小配置**：不用写。五个工具在默认值下都能用。

```json
{}
```

**完整示例**：每个键都跟着默认值，以及什么时候该改。

```jsonc
{
  // 本地桥。扩展里编译了同一个端口
  // （browser-extension/background/transport.js）：两处一起改，然后重载扩展
  "bridge": { "port": 17318 },

  // 会话规则
  "policy": {
    "authorizeOnStart": false,  // true = 不用 /chrome authorize on 就能用工具
    "closeOwnTabsOnExit": true  // 会话结束时关掉本会话开的标签
  },

  // 输入与时限
  "input": {
    "dragSteps": 10,            // 按下与松开之间的鼠标移动次数
    "scrollSteps": 5            // 每次 scroll 的滚轮事件数
  },
  "timing": { "navigateTimeoutMs": 15000 },  // 等 load 事件的时长；navigate 调用再多给 2 秒

  // 模型可见的输出
  "output": {
    "maxElements": 80,          // 快照元素上限
    "textChars": 18000          // see 的 text 模式正文上限，其余带提示丢掉
  },

  // 截图
  "screenshot": {
    "dir": "/home/me/.pi/agent/pi-browser-use-lite/screenshots",  // 第一次用时创建
    "format": "png",            // png | jpeg
    "keepNewest": 20            // 这个目录里更旧的截图会被删掉
  },

  // 工具开关与名字。至少留一个启用；名字不能重复，也不能盖住宿主已有的工具
  "tools": {
    "chrome_act": { "enabled": true, "name": "chrome_act" },
    "chrome_see": { "enabled": true, "name": "chrome_see" },
    "chrome_tab": { "enabled": true, "name": "chrome_tab" },
    "chrome_vision": { "enabled": true, "name": "chrome_vision" },
    "chrome_cdp": { "enabled": true, "name": "chrome_cdp" }
  },

  // 按工具改内置提示。"" 清空 description 或 promptSnippet；[] 表示不加规则
  "guidance": {
    "chrome_act": {
      "description": "操作用户真实的浏览器。",
      "promptSnippet": "操作浏览器",
      "promptGuidelines": ["chrome_act: navigate 时带上 see: refs。"]
    }
  }
}
```

每个键都可选。范围与默认值在 `src/config/schema.ts`。

## 文档

| 文档 | 内容 |
|---|---|
| [ARCHITECTURE](docs/ARCHITECTURE.md) | 模块边界与 seam；改结构之前先读它 |
| [GLOSSARY](docs/GLOSSARY.md) | 一个概念只用一个词 |
| [Modules](docs/modules/) | 每个模块的取舍与坑 |
| [Decisions](docs/decisions/) | 为什么是这个形状 |

## 开发

在仓库根执行：

```bash
pnpm -C packages/pi-browser-use-lite lint
pnpm -C packages/pi-browser-use-lite check:imports
pnpm -C packages/pi-browser-use-lite typecheck
pnpm -C packages/pi-browser-use-lite test
```

端到端测试会驱动真实浏览器。把 `packages/pi-browser-use-lite/browser-extension` 加载进扩展，留一个开着的 Chromium 系浏览器，然后运行：

```bash
pnpm -C packages/pi-browser-use-lite test:e2e
```

关掉其他装了本扩展的浏览器。两份扩展会抢同一个桥，命令落到先问的那一份。

桥报出的版本与扩展不同的时候，扩展会自己重载。改了扩展代码但没升版本号时，去扩展页手动重载一次。

## 许可证

MIT，见 [LICENSE](LICENSE)。
