# pi-herdr-subagents-lite

**[简体中文](README.zh-CN.md)** | [English](README.md)

本扩展把子代理跑成独立的 pi 进程，一个子代理占一个 herdr pane。工具有两个 action：`run` 起子代理，`send` 投递后续消息。结果异步回投。行为以 [v1 契约](docs/specs/0001-v1-contract.md) 为准。

## 功能

- 子代理是独立进程，人可以接管它的 pane。cwd 与父会话相同时，它在同一 workspace 新开 tab；不同则新建 workspace。
- profile 两层：全局一层，项目一层，都是 Markdown 加 frontmatter。
- `run` 立即返回。每个回合结束投一条 `subagent_result`，落在 `aggregateWindowMs` 内的合并成一条，超长的落 artifact 文件。
- 反问留在子 pane。子代理弹对话框只发 `herdr:blocked`，父会话收不到。人在子 pane 里回答。
- 默认不嵌套，也不是沙箱。profile 不点名，子代理的工具集就没有本工具。

## 安装

```bash
pi install npm:pi-herdr-subagents-lite              # npm
pi install /path/to/pi-herdr-subagents-lite         # 本地源码
pi -e /path/to/pi-herdr-subagents-lite/src/index.ts # 只对当前进程生效
```

旧仓已并入 monorepo，请从 npm 装。

不要加 `-l`。`-l` 只写项目设置，别的 workspace 里起的子代理就加载不到。`pi -e` 同样只对当前进程生效。

要求 Node `>= 22.19`。在 herdr `0.9.5` 与 pi `1.4.0` 上测过。父会话必须跑在 herdr pane 里，否则工具返回 `not_in_herdr`。

升级用 `pi update --extensions`，卸载用 `pi remove <source>`。

## 配置

全局只有一个文件：`<agent-dir>/pi-herdr-subagents-lite/config.json`。`<agent-dir>` 默认 `~/.pi/agent`，跟随 `PI_CODING_AGENT_DIR`。扩展不读项目级配置。

键与语义见[契约 §1](docs/specs/0001-v1-contract.md#1-配置)。默认值与 clamp 边界见 `src/config/index.ts` 与 `test/config/config.test.ts`。

### 最小配置

文件不存在时全部取默认值。只改一项，就只写这一项：

```json
{
  "maxConcurrent": 4
}
```

### 完整配置

下面列出全部键，每个取值就是默认值。

```jsonc
{
  // 默认 true。false = 模型看不到本工具。bridge 有独立开关。
  "enabled": true,
  // 默认 "subagent"。须匹配 ^[a-z][a-z0-9_]{0,31}$。它会作为每条 guideline 的前缀。
  "toolName": "subagent",
  // 默认 "herdr"。裸名从 PATH 解析。绝对路径锁定版本。
  "herdrBin": "herdr",
  // 默认 16，下限 1。到上限时 run 返回 max_concurrent。只有进行中的回合占槽。
  "maxConcurrent": 16,
  // 默认 16384，范围 1024 到 1048576。超上限时全文落 artifact 文件。消息里留截断的头和路径。
  "maxResultChars": 16384,
  // 默认 500，范围 0 到 10000，单位毫秒。0 = 逐条立即投递。调大合并更多结果。
  "aggregateWindowMs": 500,
  // 默认 ["quit", "reload"]。取值：new、resume、fork、quit、reload。列出的原因会在父会话退出时关掉子 pane。
  "closeChildrenOn": ["quit", "reload"],
  // 默认 false。true = 失败或中断的回合结束后关 pane。false 留着，send 可以续。
  "closeOnFailure": false,
  // 默认 250，范围 50 到 5000，单位毫秒。调大省唤醒，投递变慢。
  "inboxPollMs": 250,
  // 默认 15000，范围 1000 到 300000，单位毫秒。多久查一次进行中的子代理还活着没有。连续三次缺席判为失去联系。
  "livenessPollMs": 15000,
  // 工具文案覆盖。每个键默认未设置，用下面这份内置文案。
  "prompts": {
    // 替换内置描述。
    "description": "Use run when a task is self-contained and long-running. Use send to pass information to a subagent.",
    // Available tools 里的那一行。空 = 不出现在该列表。
    "snippet": "",
    // 替换内置 guideline 各行。保留 {{profiles}} 才会列出 profile。
    "guidelines": [
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

文件必须是严格 JSON，扩展只在加载时读一次。改完删掉注释，重启 pi。

未知键、类型不对或枚举值非法都会让扩展加载失败：pi 打出 `invalid config <路径>: <字段>: unknown key` 后退出。越界的数字夹到边界，不报错。

## 用法

1. 在 herdr pane 里启动 `pi`。
2. 写一个 profile（见下一节）。frontmatter 的 `name` 就是 `run` 的寻址名。
3. 让模型调用工具：

```json
{"action":"run","profile":"explore","task":"读 README.md，回答它的第一个标题。"}
```

工具返回 `{"state":"running",...}`。子代理在自己的 tab 里跑，稍后收到 `[subagent explore-1] done`。不要在同一轮里等结果。之后向它投递消息：

```json
{"action":"send","name":"explore-1","message":"也看一下 Windows 那条分支。"}
```

### Profile

全局 profile 放 `<agent-dir>/pi-herdr-subagents-lite/profiles/*.md`。项目 profile 放 `.pi/pi-herdr-subagents-lite/profiles/*.md`，项目受信后才读。同名时项目覆盖全局。

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

# 这个 run 的 done 回合结束后关掉 pane。false 则留着，send 还能续
auto-exit: true

# true = 不出现在 guidelines 的 profile 列表里。显式 run 仍然可用
disable-model-invocation: false
---

你是一名只读探索者。回答时给出文件路径与行号。
```

错误码见[契约 §2](docs/specs/0001-v1-contract.md#2-profile)。默认值见 `src/profile/frontmatter.ts` 与 `test/profile/`。

没写 `name`、字段非法、同层同名的 profile 都不进列表。`run` 点到它时返回 `profile_invalid`，带文件、字段与原因。

扩展自带一个示例，文件名和 `name` 都是 `worker`。加载只读 `profiles/*.md`，同时把 `profiles/examples/` 对齐到包内示例：重写自带文件，删掉多余文件。所以把示例复制到上一层：

```bash
cd <agent-dir>/pi-herdr-subagents-lite/profiles && cp examples/worker.md worker.md
```

## 参考项目

| 项目 | 借鉴内容 |
|---|---|
| [earendil-works/pi](https://github.com/earendil-works/pi) | 扩展 API、包布局、官方示例 |
| [fyang93/pi-herdr-subagents](https://github.com/fyang93/pi-herdr-subagents) | profile 字段形状；隔离 herdr session 的集成测试 |
| [modem-dev/pi-herdr-subagents](https://github.com/modem-dev/pi-herdr-subagents) | herdr 启动与生命周期；终态归类 |
| [purboo/pi-durable-subagents](https://github.com/purboo/pi-durable-subagents) | 异步投递、幂等、只上报一次 |

本扩展建在这些项目之上。谢谢各位作者。

## 文档

| 文档 | 内容 |
|---|---|
| [ARCHITECTURE](docs/ARCHITECTURE.md) | 模块边界、依赖方向、测试 seam |
| [GLOSSARY](docs/GLOSSARY.md) | 术语唯一来源 |
| [Modules](docs/modules/) | 各模块的用法与取舍 |
| [Decisions](docs/decisions/) | 一条决策一份文件 |
| [Spec](docs/specs/0001-v1-contract.md) | v1 契约 |
| [Research](docs/research/) | herdr 与 pi 的实测记录 |
| [CHANGELOG.md](CHANGELOG.md) | 发布记录 |

## License

MIT，见 [LICENSE](LICENSE)。
