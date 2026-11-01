# 0001 v1 契约

v1 对外配置、工具、结果与 bridge；代码按本文实现。决策理由见 [决策](../decisions/README.md)，工具文案见 `src/tool/text.ts`。

一句话：一个工具，两个 action（`run` / `send`）；结果异步；子代理跑在 herdr pane；fresh only。

## 1. 配置

路径：

- 只有全局一份：`<agent-dir>/pi-herdr-subagents-lite/config.json`；`<agent-dir>` 默认 `~/.pi/agent`，可用 `PI_CODING_AGENT_DIR` 重定位。不读项目配置。
- 严格 JSON：未知键、类型错误、枚举错误 = 配置无效；扩展加载失败，pi 报错退出并提示 `pi -ne`，错误里指出字段。数值越界静默 clamp。
- 只读一次；改完重启 pi 生效。文件不存在 = 全部默认。

默认值与 clamp 边界以 `src/config/index.ts` 与 `test/config/config.test.ts` 为准；本表只写语义。

| 键 | 类型 | 允许 | 说明 |
|---|---|---|---|
| `enabled` | boolean | — | 只控制工具注册；bridge 由 `bridge.enabled` 独立控制；已跑子代理不受影响 |
| `toolName` | string | `^[a-z][a-z0-9_]{0,31}$` | 跨扩展重名不处理 |
| `herdrBin` | string | 非空 | herdr 可执行文件；裸名按 PATH 解析；用绝对路径可指定版本 |
| `maxConcurrent` | integer | 越界 clamp | 每个父会话的 live 子代理上限；只有下界，无上限；`auto-exit: false` 的 done 子代理仍算 live |
| `maxResultChars` | integer | 越界 clamp | 字符数；超过则全文落 artifact |
| `aggregateWindowMs` | integer | 越界 clamp | 0 = 不聚合，逐个回投 |
| `closeChildrenOn` | string[] | `new` / `resume` / `fork` / `quit` / `reload` | 空 = 不关；命中 `session_shutdown.reason` 时关该父会话的子 tab |
| `inboxPollMs` | integer | 越界 clamp | 子侧 inbox 轮询间隔 |
| `pollIntervalMs` | integer | 越界 clamp | 父侧 `agent list` 轮询间隔（活跃档：有 run 在 working / blocked / unknown，或刚 `run` / `send`） |
| `idlePollIntervalMs` | integer | 越界 clamp | 慢速档间隔：所有 live run 都只是收工等 `send` 时用它；pane 消失的最晚发现时间等于它（pane 还在、进程被杀的那类固定 10 秒） |
| `prompts` | object | — | 提示词覆盖；键与展开见 `src/tool/text.ts` |
| `bridge` | object | — | 见第 7 节 |

`closeChildrenOn` 未命中时只停止投递，不关 tab。父进程自己关 tab 前先停轮询，所以关掉之后不会再发死亡通知；tab 有多个 pane 时不关，保留并通知。父进程崩溃没有 shutdown，不关、不认领。

固定文件：

| 项 | 值 |
|---|---|
| 子 session | `<agent-dir>/pi-herdr-subagents-lite/sessions/<name>-<runId>.jsonl`；`runId` 每个 run 唯一 |
| 任务简报 | `<childSession>.brief.md` |
| 身份文件 | `<childSession>.identity.md`；存 profile body |
| 子侧 inbox | `<childSession>.inbox/`；投递成功后删除消息文件；失败保留（at-least-once）；第一条是 `@<childSession>.brief.md`，目录在 `agent start` 前建好、消息在它返回后入队 |
| 结果 artifact | `<childSession>.result-<seq>.md` |
| 退出回执 | `<childSession>.exit`；只在 `<childSession>.inbox/` 存在时写 |

## 2. Profile

路径：全局 `<agent-dir>/pi-herdr-subagents-lite/profiles/*.md`，项目 `.pi/pi-herdr-subagents-lite/profiles/*.md`；同名（frontmatter `name`）项目覆盖全局。项目 profile 只在项目受信任后读取。

格式：YAML frontmatter + Markdown body。profile 名 = frontmatter `name`，必填，去首尾空白后不能为空；文件名不参与寻址。guidelines 与 `run` 都只用这个名字。

省略时的取值见 `src/profile/frontmatter.ts` 与 `test/profile/`。

| 字段 | 类型 | 说明 |
|---|---|---|
| `name` | string | 必填；profile 键，也是 guidelines 里的显示名；不影响 tab / pane / agent name |
| `description` | string | 出现在工具 guidelines 的 profile 列表 |
| `model` | string | provider/model 或 pi 支持的 pattern；省略 = 继承父 |
| `thinking` | string | off / minimal / low / medium / high / xhigh / max；省略 = 继承父 |
| `tools` | string | 省略 = pi 默认集，加 `--exclude-tools <toolName>`（防嵌套；`--tools -<toolName>` 不过滤扩展工具）；纯名字 = 严格 allowlist；`+name` / `-name` = 在默认集增删，除显式写 `+<toolName>` 外仍排除本工具；两者不能混用；空字符串 = 空 allowlist |
| `skills` | string / list | 省略 = pi 默认发现；`""` 或 `[]` = 不加载 skill；非空列表 = 只加载列出的项，名字按 pi 默认发现集解析（agent-dir、项目 `.pi/skills`、`.agents/skills`、包内、settings 配置）；列表项是名字，不带 `+` / `-`；查不到报 `profile_invalid` |
| `system-prompt` | string | append / replace / task，见 [DEC-0051](../decisions/0051-system-prompt.md) |
| `auto-exit` | boolean | true = 任务收工后子进程自己 shutdown，父侧关 tab；有未答对话框或未取 inbox 消息时不退 |
| `disable-model-invocation` | boolean | true = 从 guidelines 隐藏，显式 run 仍可用 |

- `ask_user_question` 不自动加入；想反问就写进 `tools`。
- 子代理默认没有本工具，嵌套要显式打开：纯名字列表里写上工具名，或在 `+name` 列表里写 `+<toolName>`。不管理嵌套深度。
- 未知字段忽略；解析失败只跳过该 profile，并在工具错误里说明。
- `name` 缺失、不是字符串或为空白：该 profile 不加载；`run` 返回 `profile_invalid`，按文件名定位。
- 同一层两个文件同名：两个都不加载，`profile_invalid` 列出两个文件；项目层与全局层同名仍是项目覆盖。
- 安装后扩展写一份示例到 `profiles/examples/domain.md`，只在文件缺失时写，不覆盖；示例的 `name` 也是 `domain`。加载只看 `profiles/*.md`，所以示例默认不生效，复制一层即用。

## 3. 工具

注册信息：

| 项 | 值 |
|---|---|
| name | `config.toolName`，默认 `subagent` |
| label | `Subagent` |
| description / snippet / guidelines | 见 `src/tool/text.ts`；guideline 自动加 `toolName: ` 前缀；`{{profiles}}` 在注册时展开 |

参数（schema 以 `src/tool/schema.ts` 为准）：

| 字段 | 用于 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| `action` | run / send | 是 | run / send | 选择动作 |
| `profile` | run | 是 | string | profile 名；未知时报错并列出可用 profile |
| `task` | run | 是 | string | 自包含任务；原样写入 brief，不要再写 `# Task` 段；brief 会落盘，不写密钥 |
| `cwd` | run | 否 | string | 子进程工作目录；相对路径按父 cwd 解析，`~` 展开为 home；省略 = 父 cwd |
| `name` | send | 是 | string | run 返回的子代理名；匹配 `^[a-z][a-z0-9_-]{0,31}$` |
| `message` | send | 是 | string | 新消息 |

返回：

~~~json
{"state":"running","name":"explore-1","paneId":"w1:p4","sessionFile":"<childSession>"}
{"state":"sent","name":"explore-1"}
{"state":"restarted","name":"explore-1","paneId":"w1:p4"}
~~~

错误以 `isError: true` 返回，文本前缀是 code：

| code | 何时 | 模型看到 |
|---|---|---|
| `not_in_herdr` | 父会话不在 herdr pane | 必须在 herdr 里运行；无降级 |
| `unknown_profile` | run 的 profile 不存在 | 当前 profile 列表（name + description） |
| `unknown_agent` | send 的 name 不在 run 记录里 | 当前可用名称 |
| `max_concurrent` | live 子代理已达 maxConcurrent：run 新建，或 send 到已收工、已退出的 run；此时不投递、不重启 | 当前 live 名称；等结果或关一个 |
| `profile_invalid` | profile 字段解析失败，或 `skills` 里的名字找不到 | 文件 + 字段 + 原因，或 skill 名 + cwd |
| `spawn_failed` | tab / pane / agent start 失败、会话正在关闭、重启前关旧 tab 失败；含未就绪与 trust 对话框拦住 | 底层错误；已创建的 pane id 保留；未就绪时附「去 pane 处理对话框」 |
| `name_exhausted` | 自动命名重试用尽仍冲突 | 尝试 100 次仍无空闲名 |
| `tail_dirty` | 需要重启，但 session 尾部有未完成 toolCall | 不重启；先检查，避免重放副作用 |
| `session_missing` | send 的 run 记录存在，但子 session 文件不存在 | 用 run 新建 |
| `session_unreadable` | send 的 run 记录存在，子 session 文件存在但读不了 | 不重启；用 run 新建 |

结果 artifact 写失败不是工具错误：不返回 `isError`，结果消息保留截断头部并附警告。

- 只覆盖 `guidelines` 且没写 `{{profiles}}` 时，模型看不到 profile 列表；`snippet: ""` 的实际效果是从 Available tools 隐藏。

例子：

~~~json
{"action":"run","profile":"explore","task":"Find every place that reads HERDR_ENV and summarize the call chain."}
{"action":"run","profile":"explore","task":"Review the migration.","cwd":"../billing"}
{"action":"send","name":"explore-1","message":"Also check the Windows-specific branch."}
~~~

## 4. 命名与展示

- `name = <profile>-<n>`；slug 由 profile 名派生，规则见 `src/run/naming.ts`。
- `n` 从 1 开始，按 profile slug 递增；`agent_name_taken` 时 +1 重试，用尽后 `name_exhausted`（上限 100，见 `src/run/start.ts`）。
- tab 标签 = `name`。
- 侧边栏显示 herdr 的 agent name；**不设 `display_agent`**。
- pane 标签 = 任务第一行；去掉 markdown 前缀、折叠空白、去控制字符、截 32 字；为空时用 `name`。
- 不设 `title` / `state_labels`；新 workspace 的 label 创建时设为 `name`，之后不改。
- cwd 与父 cwd 不同时，用 `workspace create` 返回的初始 tab 作为子代理 tab：把该 tab 的 label 改成 `name`；不追加第二个 tab。
- `send` 用同一个 `name`。
- 人改 tab 标签不影响寻址。`agent list` 里认一个 run 的顺序：条目 `agent_session.value` 与 run 的 `sessionFile` 相同 → run 记录的 `paneId` 相同 → `name` 相同。

## 5. send 语义

`send` 把消息送到子代理；子代理已退出时用同一 session 重启续聊。inbox 轮询由子进程里的本包完成；全局安装是前提。

| 子代理状态 | send 做什么 | 返回 |
|---|---|---|
| agent 存在（working / idle / blocked / done / unknown） | 写 `<childSession>.inbox/`；子进程按自己是否 idle 选择新 turn 或 steer；有未答对话框时排队，人回答后处理 | `{state:"sent", name}` |
| 已退出，pane 还在，尾部干净，`auto-exit` 未变 | 同 pane、同名 `agent start --session <childSession>`，再写 inbox；profile 重新读取 | `{state:"restarted", name, paneId}` |
| 已退出，pane 已关（auto-exit） | 新建 tab，同名 `agent start --session <childSession>`，再写 inbox | `{state:"restarted", name, paneId}` |
| 已退出（尾部干净）或已收工但仍活着，live 已达 `maxConcurrent` | 不投递、不重启 | `max_concurrent` |
| 已退出，尾部有未完成 toolCall | 不重启 | `tail_dirty` |
| 子 session 文件不存在 | 不重启 | `session_missing` |
| name 不在 run 记录 | 不投递 | `unknown_agent` |

「尾部干净」看最后一条 assistant 消息里有没有未完成的 toolCall；尾部是 toolResult、user 或 custom 条目都不改变这个判断。

重启用 run 记录的 `cwd`；profile 重新读取（DEC-0031），非 `task` 模式按新 profile 重写身份文件。新 profile 的 `auto-exit` 与建 tab 时的值不一致时，关掉旧 tab（只在它只剩该 pane 时）并新建 tab；一致则复用原 pane。cwd 与父 cwd 不同时用新 workspace 的初始 tab；相同时 `tab create` 不带 `--workspace`，由 herdr 落在当前 workspace（实测父会话所在 workspace）。

## 6. 结果消息

完成检测按 `completion_seq` 与本 run 的 `lastHandledSeq` 去重：每次完成最多投递一条 done 结果；同一个 run 经 `send` 续聊后可有多条。`close_failed` 是在 done 之后、关 tab 失败时补投的 unknown。单次 `agent list` 失败不是死亡；死亡只认事实：有退出回执，或 pane 不在 `pane list` 里。`agent list` 这一拍查不到只算「没看见」，保持 live 满 10 秒才判死（只为被 SIGKILL、写不出回执、pane 又还在的子进程）。机制见 [DEC-0052](../decisions/0052-completion-snapshot.md)。

异步结果是一条 `subagent_result` 自定义消息；父模型看到的是文本，不是工具结果：

~~~text
[subagent explore-1] done

<result text, up to maxResultChars>

Full result: <childSession>.result-3.md
~~~

- 只有超过 `maxResultChars` 才写 artifact，并带 `Full result:` 行；未超限时消息不带路径。
- artifact 的 `seq` 按 run 内已写成的 artifact 递增，重启后继续，不重置。
- artifact 不清理；v1 没有过期或回收。
- 聚合时一条消息里放多个块：

~~~text
[subagent explore-1] done
...

[subagent review-1] done
...
~~~

- 子代理死亡时按子 session 尾部与 `<childSession>.exit` 判定（回执只有 `{ reason }`）：

| 回执 | 结果 |
|---|---|
| 有回执，session 尾部有最终文本且没有未完成 toolCall | `done`，正文取该文本 |
| 有回执，尾部没有可用文本 | `unknown`，原因 `quitted` |
| 没有回执（没走 shutdown） | 退回读 session 尾部，同上判定；否则 `unknown`，原因 `pane_exited` |

- `agent list` 里找不到该 run 时：有退出回执或 pane 已不在，当场判死；否则只算「这一拍没看见」，保持 live 与活跃档，满 10 秒再报 `pane_exited`（只为被 SIGKILL 的子进程存在）。
- 同一个 run 只投一次同一段文本：回执路径与轮询路径都跳过已投递的文本。
- 子代理还没写过 assistant 消息时不结算，继续等它写完或死亡（防止启动阶段的 idle 被当成完成）。
- 其余 `unknown` 原因：`no_result`（读 3 次仍没有文本，且这个 run 从未投递过结果）、`poll_failed`（连续 3 拍失败：每拍 `agent list` 失败记一次，单个 run 的处理抛错也记一次）、`close_failed`（关 tab 失败后补投）。

~~~text
[subagent explore-1] the pane exited without a result

Session file: <childSession>
~~~

- 死亡消息是该 run 的终态：最多一条，不受 `lastHandledSeq` 约束。
- 子代理 blocked（`agent_status = blocked`）时父侧不发消息，也不读它的 toolCall：问题与答案都留在子 pane，由人处理。blocked 期间不结算结果，继续等它离开 blocked。
- 投递失败不重发；父会话收到一条 `subagent result not delivered` 通知。
- `auto-exit: true` 的子代理收工并投递 `done` 结果后，父侧再关只含该 pane 的 tab；`unknown` 不关。

## 7. bridge

同一扩展内的监听器，不单独入口；全局安装后所有 pi 进程都加载。

- 不单独注册工具；顶层 `enabled` 只跳过工具（见第 1 节）。
- 监听 `ui_prompt_start` / `ui_prompt_end`，emit `herdr:blocked`（`{active, label}`）。
- `blockedOn` 决定哪些 `ui_prompt` kind 算 blocked；默认 `custom` / `select` / `confirm` / `input` / `editor`。
- `bridge.enabled: false` 或 `blockedOn: []` = 不上报。
- `label` 取 `title`，没有则取 `kind`；herdr 集成把它作为 blocked message。
- 不依赖第三方 ask 事件；子进程即使没有 `subagent` 工具，也照常上报。
- 配置错误按第 1 节处理。
