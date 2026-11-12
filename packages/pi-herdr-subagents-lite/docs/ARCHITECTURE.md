# 架构 · pi-herdr-subagents-lite

本包遵循最小 package：package 根就是仓库工作目录，`src/` 放模块，`test/` 放测试，`docs/` 放文档。包只做 herdr，模块按职责切分，不按 controller / service / adapter 分层。

本文件只写模块边界、依赖方向、命名与拆分规则、测试 seam 与文档规则。签名以代码与类型为准。对外契约见 [v1 契约](specs/0001-v1-contract.md)，理由见[决策](decisions/README.md)。

## 1. 命名与拆分规则

- 模块名是职责的普通名词，小写、单数：`config`、`profile`、`inbox`、`bridge`、`run`。禁用看不出职责的词：`utils`、`common`、`helpers`、`core`、`ports`、`service`、`manager`。
- 一个模块一个目录，对外只经 `index.ts`。产品代码只从入口 import。测试可以直接 import 模块内文件，那正是 seam。
- 模块内一个文件一件事，不用 `-er` / `-or` 结尾的施动者名（`poller.ts`、`handler.ts`）。
- 单文件上限 150 行，超过就拆。按「谁变」拆，不按「谁像」拆：一侧改而另一侧不动的代码，放两个文件。
- 类型放在用它的模块里。跨模块只从模块入口 import。

## 2. 模块

每个模块对外只经 `src/<module>/index.ts`。

| 模块 | 职责 | 文件 |
|---|---|---|
| `index.ts` | composition root：构造真实依赖、写入示例 profile、导出扩展 | — |
| [`error`](modules/error.md) | 把 `unknown` 错误转成文本 | `index.ts` |
| [`extension`](modules/extension.md) | pi 装配：注册工具、挂 `session_start` / `session_shutdown`、子侧 inbox 泵与回合上报、父会话收尾 | `index.ts` `report.ts` `shutdown.ts` |
| [`tool`](modules/tool.md) | 模型面：参数 schema、文案、错误渲染、结果消息信封 | `index.ts` `schema.ts` `text.ts` `errors.ts` `message.ts` |
| [`run`](modules/run.md) | run 生命周期：槽位、命名、启动、回合结算、存活、send、关闭 | `index.ts` 加 18 个职责文件，见 [run](modules/run.md#结构) |
| [`herdr`](modules/herdr.md) | herdr CLI 端口 | `index.ts` `cli.ts` `agent.ts` `pane.ts` |
| [`turn`](modules/turn.md) | 回合事件：判定、原子读写、消费 | `index.ts` |
| [`session-file`](modules/session-file.md) | 读子 session 尾部，只判断 send 前有没有未完成的工具调用 | `index.ts` `jsonl.ts` `tail.ts` |
| [`inbox`](modules/inbox.md) | `<runBase>.inbox/` 文件协议与子侧泵 | `index.ts` `pump.ts` |
| [`config`](modules/config.md) | 全局配置读取与严格校验 | `index.ts` `schema.ts` |
| [`profile`](modules/profile.md) | profile 读取、校验、分层、示例落盘 | `index.ts` `frontmatter.ts` `layers.ts` `examples.ts` `seed.ts` `skills.ts` |
| [`bridge`](modules/bridge.md) | `ui_prompt_*` → `herdr:blocked`，按 `bridge.enabled` / `blockedOn` 过滤 | `index.ts` |

入口不是模块。它构造真实 host、配置、profile 加载器与 session 读取器，注入 `createExtension`。加载时还调一次 `seedExampleProfile(globalProfilesDir())`，把 `profiles/examples/` 对齐到包内示例（DEC-0057）。

## 3. 依赖方向

~~~text
index -> extension
index -> config
index -> herdr
index -> profile
index -> session-file
extension -> tool
extension -> run
extension ..> config   (type-only)
extension ..> herdr    (type-only)
extension ..> profile  (type-only)
extension -> bridge
extension -> inbox
extension -> error
extension ..> session-file (type-only)
tool -> run
tool ..> config       (type-only)
tool ..> profile      (type-only)
run -> turn
extension -> turn
run -> herdr
run -> profile
run ..> session-file
run -> inbox
run -> config
run -> error
bridge ..> config      (type-only)
profile -> config
profile -> error
~~~

- 只能沿箭头依赖，禁止反向 import。`config`、`error`、`herdr`、`session-file`、`inbox` 是叶子。
- `error` 只把 `unknown` 转成文本，不 import 任何模块。`config` 只认 Node fs/path，不 import pi，配置错误只有一条带字段名的 Error。`inbox` 只认 Node fs/path/crypto，不解析消息内容，不记投递失败次数，泵的每拍动作由调用方注入。
- `run` 不 import pi。`extension` 不 import 真实 CLI 或 fs。只有 `index.ts` 把真实适配器、配置与 pi 装配到一起。
- 宿主包 `@earendil-works/pi-coding-agent` 在 `src/index.ts`、`src/extension/index.ts`、`src/tool/index.ts` 只做 type-only import，在 `src/profile/` 做运行时 import。`typebox` 只在 `tool/schema.ts`。
- 上述边与单一出口由仓库根的 `scripts/check-imports.mjs` 执行（`pnpm check:imports`）。改图时同步改本包 `scripts/import-graph.mjs` 的 `edges` / `singleImport`。脚本只校验源码，不比对本文。

## 4. 测试 seam

`test/` 按被测模块分目录：`config/` `profile/` `herdr/` `session-file/` `inbox/`。bridge 的测试在 `inbox/` 下，两者共用一个 session 路径。经扩展工具跑的行为测试放 `test/tool/`。装配与组合根的测试是 `test/index.test.ts`。共享夹具放 `test/support/`。一个文件一个行为面，单文件同样 150 行上限。

| seam | 用法 | 覆盖 |
|---|---|---|
| pi 扩展 API + 注入 HerdrHost | fake pi、fake host、fake timers、临时 session JSONL。`PI_CODING_AGENT_DIR` 指向临时目录 | 工具契约、run 生命周期、profile argv、身份文件、并发、send 投递与重启、结果消息、关闭 |
| `loadConfig` | 临时 agent 目录 + 真实 fs | 默认值、clamp、严格校验 |
| `loadProfiles` | 临时 agent 目录、临时项目目录 + 真实 fs | frontmatter、`name` 必填、字段校验、坏字段、同层同名、受信项目覆盖。示例目录每次加载对齐到包内 |
| `readSessionTail` | 表驱动 + 临时 JSONL | 工具调用尾部、坏行、缺文件 |
| `turn` | 临时目录 + 真实 fs | 判定、原子写、坏文件、消费后删除、计数 |
| `inbox` | 临时 session 路径 + 真实 fs。子侧泵经 fake pi + fake timers | 建目录、入队顺序、按序投递、投递后删除、失败保留 |
| bridge | fake pi events | `ui_prompt_*` → `herdr:blocked`、`blockedOn` 过滤 |
| 真实 HerdrHost + 真实 pi | `pnpm test:e2e`（`test/e2e/`，不进 `pnpm check`） | CLI argv/JSON、tab/agent/pane、真实 child、结果回投、send 投递、关 pane |
| `createPaneCommands` | fake `exec`（记 argv、回固定 JSON） | workspace / tab 的 argv 与 JSON 字段解析 |

mock 只有三处：pi 扩展 API、注入的 `HerdrHost`、注入的 `exec`。不 mock 模块内部，不 mock Node fs。真实 herdr 行为变化时，先补[研究记录](research/)再改代码。真机回归跑 `pnpm test:e2e`。

## 5. 文档职责

| 文件 | 只写 | 不写 |
|---|---|---|
| `README.md` | 功能、要求、安装、用法、profile、配置、参考项目、文档索引、开发、许可 | 模块签名、选型理由 |
| `docs/ARCHITECTURE.md` | 模块边界、依赖方向、命名与拆分规则、测试 seam、文档规则、模块索引 | 字段表、决策理由、进度、模块用法 |
| `docs/decisions/*.md` | 决策编号、理由、取消项、边界，一条一份 | 字段表、配置、命令行 |
| `docs/specs/*.md` | 对外配置、profile、工具、命名、结果、send、bridge 的契约 | 决策理由、内部签名 |
| `docs/GLOSSARY.md` | 本扩展特有术语的唯一命名来源 | 实现细节 |
| `docs/modules/*.md` | 单个模块的用法与取舍 | 依赖方向、契约字段表 |
| `docs/research/*.md` | 外部实测与参考记录 | 当前契约 |

归属冲突时以本表裁决。跨文档只允许指针，不允许复述。

## 6. 约束

- 不建自建 registry，不做角色检测，不设展示字段。见 DEC-0038、DEC-0046、DEC-0033。
- 交付前 QA 跑 `pnpm check`，组成见 `package.json`。
- 真机验收跑 `pnpm test:e2e`。它自建隔离 agent 目录与 herdr session（见 `test/e2e/harness.ts`），缺 herdr、pi 或 auth 时跳过。
