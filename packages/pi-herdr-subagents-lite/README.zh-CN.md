# pi-herdr-subagents-lite

**[简体中文](README.zh-CN.md)** | [English](README.md)

本扩展让子代理作为独立 pi 进程，跑在 herdr pane 里。一个工具有两个 action：`run` 起子代理，`send` 续聊。结果异步回投。行为以 [v1 契约](docs/specs/0001-v1-contract.md) 为准。

## 功能

- 独立进程，可人工接管。每个子代理是 herdr pane 里的独立 pi 进程。子代理的 cwd 与父相同时，它在同一个 workspace 新开 tab。cwd 不同时，它新建 workspace。
- 两层 profile：Markdown + frontmatter。全局一层，项目一层。
- 结果异步，可合并。`run` 立即返回。每次收工投一条 `subagent_result`。落在 `aggregateWindowMs` 内的结果合并成一条。超长结果落 artifact 文件。
- 反问留在人这边。子代理弹对话框只发 `herdr:blocked`。父侧收不到这个消息。人在子 pane 里回答。
- 默认不嵌套，也不是沙箱。子代理的工具集默认去掉本工具。只有 profile 点名，才授予本工具。

## 安装

```bash
pi install npm:pi-herdr-subagents-lite              # npm
pi install /path/to/pi-herdr-subagents-lite         # 本地源码
pi -e /path/to/pi-herdr-subagents-lite/src/index.ts # 只对当前进程生效
```

旧仓已并入 monorepo。请用 npm 安装。

不要加 `-l`。`-l` 只写项目设置，在别的 workspace 里起的子代理就加载不到。`pi -e` 同样是单进程。

在 herdr `0.9.5` 与 pi `1.4.0` 上测过，Node `>= 22.19`。父会话必须在 herdr pane 里。不在时返回 `not_in_herdr`。升级用 `pi update --extensions`。卸载用 `pi remove <source>`。

## 配置

只有一个全局文件：`<agent-dir>/pi-herdr-subagents-lite/config.json`。`<agent-dir>` 默认 `~/.pi/agent`，跟随 `PI_CODING_AGENT_DIR`。扩展不读项目级配置。

默认值与 clamp 边界见 `src/config/index.ts` 与 `test/config/config.test.ts`。键与语义见[契约 §1](docs/specs/0001-v1-contract.md#1-配置)。

### 最小配置

文件不存在时，全部用默认值。只改一项，就只写这一项：

```json
{
  "maxConcurrent": 4
}
```

### 完整配置

下面这份列出全部键。每个取值就是默认值。

```jsonc
{
  // 默认 true。false = 模型看不到本工具。bridge 有独立开关。
  "enabled": true,
  // 默认 "subagent"。须匹配 ^[a-z][a-z0-9_]{0,31}$。它会作为每条 guideline 的前缀。
  "toolName": "subagent",
  // 默认 "herdr"。裸名从 PATH 解析。绝对路径锁定版本。
  "herdrBin": "herdr",
  // 默认 16，下限 1。到上限时 run 返回 max_concurrent。auto-exit: false 的子代理收工后仍占槽。
  "maxConcurrent": 16,
  // 默认 16384，范围 1024 到 1048576。超上限时全文落 artifact 文件。消息里留截断的头和路径。
  "maxResultChars": 16384,
  // 默认 500，范围 0 到 10000，单位毫秒。0 = 逐条立即投递。调大合并更多结果。
  "aggregateWindowMs": 500,
  // 默认空 = 从不关。取值：new、resume、fork、quit、reload。列出的原因会在父会话退出时关掉子 tab。
  "closeChildrenOn": [],
  // 默认 250，范围 50 到 5000，单位毫秒。调大省唤醒，投递变慢。
  "inboxPollMs": 250,
  // 默认 1000，范围 100 到 60000，单位毫秒。子代理在 working 或 blocked 时用它，刚 run / send 的 30 秒内也用它。
  "pollIntervalMs": 1000,
  // 默认 8000，范围 100 到 60000，单位毫秒。所有 live 子代理都只在等 send 时用它。调大后，发现 pane 消失更晚。
  "idlePollIntervalMs": 8000,
  // 工具文案覆盖。每个键默认未设置，用下面这份内置文案。
  "prompts": {
    // 替换内置描述。
    "description": "Run subagents and send them messages.",
    // Available tools 里的那一行。空 = 不出现在该列表。
    "snippet": "",
    // 替换内置 guideline 各行。保留 {{profiles}} 才会列出 profile。
    "guidelines": [
      "The parent handles user interaction, cross-task synthesis, and decisions; subagents execute.",
      "run only starts; it does not wait. The result arrives later as a message.",
      "send only delivers; no state tracking.",
      "Available profiles:\n{{profiles}}"
    ]
  },
  // 把 pi 对话框事件转成 herdr:blocked 事件。
  "bridge": {
    // 默认 true。false = 不发 herdr:blocked。
    "enabled": true,
    // 默认全五种。算作 blocked 的对话框类型：custom、select、confirm、input、editor。
    "blockedOn": ["custom", "select", "confirm", "input", "editor"]
  }
}
```

文件必须是严格 JSON。扩展只读一次，所以保存前删掉注释，改完重启 pi。未知键、类型不对或枚举值非法都会让扩展加载失败：pi 打出 `invalid config <路径>: <字段>: unknown key` 后退出。超范围的数字会被夹到边界，不报错。

## 用法

1. 在 herdr pane 里启动 `pi`。
2. 写一个 profile（下一节）。frontmatter 的 `name` 就是 `run` 的寻址名。
3. 让模型调用工具：

```json
{"action":"run","profile":"explore","task":"读 README.md，回答它的第一个标题。"}
```

工具返回 `{"state":"running",...}`。子代理在自己的 tab 里跑。稍后收到 `[subagent explore-1] done` 消息。不要在同一轮里等结果。续聊那个子代理：

```json
{"action":"send","name":"explore-1","message":"也看一下 Windows 那条分支。"}
```

### Profile

全局 profile 在 `<agent-dir>/pi-herdr-subagents-lite/profiles/*.md`。项目 profile 在 `.pi/pi-herdr-subagents-lite/profiles/*.md`，项目受信任后才读。`name` 相同时，项目覆盖全局。

```markdown
---
# run 的寻址名。文件名不参与查找
name: explore
description: 只读调研：读代码、回答问题，不改动任何文件

# 省略即继承父会话
# model: provider/model
thinking: low

# 纯名字 = 严格白名单。+名字 / -名字 在默认集上增删，两者不能混用
# 省略 = pi 默认集去掉本工具（不嵌套）。"" = 空白名单
tools: read, bash

# 省略 = 由 pi 发现。"" = 不加载。列表 = 只加载列出的
skills: ""

# append / replace：正文追加到或替换系统提示
# task：正文就是任务文本，不写身份文件
system-prompt: append

# 收工后自行退出并关掉 tab。有打开的对话框或 inbox 待投递时会等
auto-exit: true

# true = 不出现在 guidelines 的 profile 列表里。显式 run 仍然可用
disable-model-invocation: false
---

你是一名只读探索者。回答时给出文件路径与行号。
```

错误码见[契约 §2](docs/specs/0001-v1-contract.md#2-profile)。默认值见 `src/profile/frontmatter.ts` 与 `test/profile/`。没写 `name` 的文件、字段非法的文件与同层同名的文件都不进列表。对它调用 `run`，返回 `profile_invalid`，带文件、字段与原因。

扩展自带一个示例 profile。文件名和 `name` 都是 `worker`。加载只读 `profiles/*.md`。每次加载都把 `profiles/examples/` 对齐到扩展自带的示例：重写自带文件，删掉多余文件。所以复制一份到上一层即可：

```bash
cd <agent-dir>/pi-herdr-subagents-lite/profiles && cp examples/worker.md worker.md
```

## 参考项目

| 项目 | 借鉴内容 |
|---|---|
| [earendil-works/pi](https://github.com/earendil-works/pi) | 扩展 API、包布局、官方示例 |
| [fyang93/pi-herdr-subagents](https://github.com/fyang93/pi-herdr-subagents) | profile 字段形状。隔离 herdr session 的集成测试 |
| [modem-dev/pi-herdr-subagents](https://github.com/modem-dev/pi-herdr-subagents) | herdr 启动与生命周期。终态归类 |
| [purboo/pi-durable-subagents](https://github.com/purboo/pi-durable-subagents) | 异步投递、幂等、只上报一次 |

感谢这些项目的代码。

## 文档

| 文档 | 内容 |
|---|---|
| [docs/specs/0001-v1-contract.md](docs/specs/0001-v1-contract.md) | v1 契约 |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 模块边界、依赖方向、测试 seam |
| [docs/modules/](docs/modules/) | 各模块的用法与取舍 |
| [docs/GLOSSARY.md](docs/GLOSSARY.md) | 术语唯一来源 |
| [CHANGELOG.md](CHANGELOG.md) | 发布记录 |

## License

MIT，见 [LICENSE](LICENSE)。
