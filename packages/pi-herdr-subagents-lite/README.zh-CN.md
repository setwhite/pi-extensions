# pi-herdr-subagents-lite

[English](README.md) | 简体中文

pi 扩展：让子代理作为独立 pi 进程跑在 herdr pane 里。一个工具，两个 action：`run` 起子代理，`send` 续聊，结果异步回投。

行为以 [v1 契约](docs/specs/0001-v1-contract.md) 为准。

## 功能

- **独立进程，可人工接管**：每个子代理是 herdr pane 里独立的 pi 进程。cwd 与父相同则同 workspace 新开 tab，否则新建 workspace。随时切进去接管。
- **两层 profile**：Markdown + frontmatter，全局一层、项目一层。
- **异步、可合并的结果**：`run` 立即返回。每次收工投一条 `subagent_result`；落在 `aggregateWindowMs` 内的结果合并成一条。超长结果落 artifact 文件。
- **反问留在人这边**：子代理弹出对话框时只发出 `herdr:blocked` 事件，父侧什么也收不到。人在子 pane 里回答，不经模型转达。
- **默认不嵌套，也不是沙箱**：子代理的工具集默认去掉本工具，profile 里点名才授予。工具由 profile 决定，扩展不限制写操作。

## 要求

在 herdr `0.9.5` 与 pi `1.4.0` 上测过。Node `>= 22.19`。父会话必须在 herdr pane 里，否则调用返回 `not_in_herdr`。

## 安装

选一种来源，装完重启 pi。

```bash
pi install npm:pi-herdr-subagents-lite                     # npm
pi install git:github.com/setwhite/pi-herdr-subagents-lite # git
pi install /path/to/pi-herdr-subagents-lite                # 本地源码
pi -e /path/to/pi-herdr-subagents-lite/src/index.ts        # 只对当前进程生效
```

不要加 `-l`：它只写项目设置，在别的 workspace 里起的子代理就加载不到，inbox 泵和 bridge 都会失效。`pi -e` 同样是单进程。

升级用 `pi update --extensions`，卸载用 `pi remove <source>`。重启后工具列表里出现 `subagent`（或你配的 `toolName`）。

## 快速开始

1. 在 herdr pane 里启动 `pi`。
2. 写一个 profile（下一节）；frontmatter `name` 就是 `run` 的寻址名。
3. 让模型调用工具：

```json
{"action":"run","profile":"explore","task":"读 README.md，回答它的第一个标题。"}
```

它返回 `{"state":"running",...}`，子代理在自己的 tab 里跑，稍后收到 `[subagent explore-1] done` 消息。不要在同一轮里等结果。续聊那个子代理：

```json
{"action":"send","name":"explore-1","message":"也看一下 Windows 那条分支。"}
```

## Profile

全局 profile 在 `<agent-dir>/pi-herdr-subagents-lite/profiles/*.md`，项目 profile 在 `.pi/pi-herdr-subagents-lite/profiles/*.md`（项目受信任后才读）；`name` 相同时项目覆盖全局。

```markdown
---
# run 的寻址名；文件名不参与查找
name: explore
description: 只读调研：读代码、回答问题，不改动任何文件

# 省略即继承父会话
# model: provider/model
thinking: low

# 纯名字 = 严格白名单；+名字 / -名字 在默认集上增删，两者不能混用
# 省略 = pi 默认集去掉本工具（不嵌套）；"" = 空白名单
tools: read, bash

# 省略 = 由 pi 发现；"" = 不加载；列表 = 只加载列出的
skills: ""

# append / replace：正文追加到或替换系统提示
# task：正文就是任务文本，不写身份文件
system-prompt: append

# 收工后自行退出并关掉 tab；有打开的对话框或 inbox 待投递时会等
auto-exit: true

# true = 不出现在 guidelines 的 profile 列表里；显式 run 仍然可用
disable-model-invocation: false
---

你是一名只读探索者，回答时给出文件路径与行号。
```

错误码见 [契约 §2](docs/specs/0001-v1-contract.md#2-profile)；默认值见 `src/profile/frontmatter.ts` 与 `test/profile/`。没写 `name`、字段非法或同层同名的文件都不进列表；对它 `run` 返回 `profile_invalid`，带文件、字段与原因。

扩展自带一个示例 profile，文件名和 `name` 都是 `domain`。加载只读 `profiles/*.md`，示例也只在缺失时写入，所以复制一层上去即可：

```bash
cd <agent-dir>/pi-herdr-subagents-lite/profiles && cp examples/domain.md domain.md
```

## 配置

只有一个全局文件：`<agent-dir>/pi-herdr-subagents-lite/config.json`。`<agent-dir>` 默认 `~/.pi/agent`，跟随 `PI_CODING_AGENT_DIR`。项目级配置不读。

默认值与 clamp 边界：`src/config/index.ts`、`test/config/config.test.ts`。键与语义：[契约 §1](docs/specs/0001-v1-contract.md#1-配置)。

### 最小配置

文件不存在就全用默认值。只改一项，就只写这一项：

```json
{
  "maxConcurrent": 4
}
```

### 键

| 键 | 含义 |
|---|---|
| `enabled` | 只管工具注册；bridge 有自己的开关 |
| `toolName` | 模型看到的工具名；`^[a-z][a-z0-9_]{0,31}$` |
| `herdrBin` | herdr 可执行文件；裸名从 PATH 解析，绝对路径锁定版本 |
| `maxConcurrent` | 每个父会话并存的子代理数；`auto-exit: false` 的子代理收工后仍占槽 |
| `maxResultChars` | 单条结果字符上限；超了全文落 artifact，消息里留截断的头和路径 |
| `aggregateWindowMs` | 合并窗口，毫秒；0 = 逐条立即投递 |
| `closeChildrenOn` | 父会话以这些原因退出时关掉子 tab：`new` / `resume` / `fork` / `quit` / `reload`；空 = 从不关 |
| `inboxPollMs` | 子侧 inbox 轮询间隔 |
| `pollIntervalMs` | 父侧 `agent list` 间隔；有子代理在 working 或 blocked，或刚 `run` / `send` 的 30 秒内用 |
| `idlePollIntervalMs` | 所有 live 子代理都只是在等 `send` 时的间隔；它决定 pane 消失最晚多久被发现（pane 还在、进程被杀的那类固定 10 秒） |
| `prompts` | 覆盖工具文案：`description`、`snippet`、`guidelines`；省略的键用内置文案；`snippet: ""` 让工具从 Available tools 消失；保留 `{{profiles}}` 才会列出 profile |
| `bridge` | `enabled` 把 pi 对话框事件转成 `herdr:blocked`；`blockedOn` 列出算 blocked 的对话框类型 |

必须是严格 JSON：未知键、类型不对、枚举非法都会让扩展加载失败，pi 报出字段名退出。超范围的数字会被夹到边界，不报错。配置只读一次，改完重启 pi。

## 参考项目

设计参考了这些项目，感谢作者。

| 项目 | 借鉴内容 |
|---|---|
| [earendil-works/pi](https://github.com/earendil-works/pi) | 扩展 API、包布局、官方示例 |
| [fyang93/pi-herdr-subagents](https://github.com/fyang93/pi-herdr-subagents) | profile 字段形状；隔离 herdr session 的集成测试 |
| [modem-dev/pi-herdr-subagents](https://github.com/modem-dev/pi-herdr-subagents) | herdr 启动与生命周期；终态归类 |
| [purboo/pi-durable-subagents](https://github.com/purboo/pi-durable-subagents) | 异步投递、幂等、只上报一次 |

## 文档

- [ARCHITECTURE](docs/ARCHITECTURE.md)：模块边界、依赖方向、测试 seam
- [GLOSSARY](docs/GLOSSARY.md)：术语唯一来源
- [模块](docs/modules/)：各模块的用法与取舍

## 开发

```bash
pnpm install        # 装依赖
pnpm check          # 下面四项
pnpm test           # 单测（vitest）
pnpm lint           # biome
pnpm typecheck      # tsc --noEmit
pnpm check:imports  # 依赖方向，按 docs/ARCHITECTURE.md 校验
pnpm test:e2e       # 真 herdr + 真 pi 子进程，不在 pnpm check 里
```

跑一次 `git config core.hooksPath .githooks`，之后每次提交都会跑 `pnpm check`。

E2E 自己起隔离的 herdr session 与 agent 目录，缺 herdr、pi 或 `auth.json` 时整组跳过并给出原因。`PI_E2E_MODEL` 换模型；`PI_E2E_KEEP=1` 保留临时目录。

## 许可

MIT，见 [LICENSE](LICENSE)。
