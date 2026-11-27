# 架构 · pi-herdr-subagents-lite

本包遵循最小 package：package 根就是仓库工作目录，`src/` 放模块，`test/` 放测试，`docs/` 放文档。包只做 herdr 上的子代理薄范式层。对外契约见 [v2 契约](specs/0002_v2_architecture_spec.md)，理由见[决策](decisions/README.md)。

## 1. 命名与拆分规则

- 模块名是职责的普通名词，小写、单数：`config`、`herdr`、`run`、`tool`、`extension`。禁用看不出职责的词：`utils`、`common`、`helpers`、`core`、`ports`、`service`、`manager`。
- 一个模块一个目录，对外只经 `index.ts`。产品代码只从入口 import。测试可以直接 import 模块内文件，那正是 seam。
- 模块内一个文件一件事，不用 `-er` / `-or` 结尾的施动者名。
- 单文件上限 150 行，超过就拆。按「谁变」拆，不按「谁像」拆。
- 类型放在用它的模块里。跨模块只从模块入口 import。
- 不从网络校验看不见的东西：`HERDR_SOCKET_PATH`、`PI_SUBAGENT_*` 是唯一身份来源。

## 2. 模块

每个模块对外只经 `src/<module>/index.ts`。

| 模块 | 职责 | 文件 |
|---|---|---|
| `index.ts` | composition root：从环境变量取身份、构造真实依赖、导出扩展 | — |
| [`config`](modules/config.md) | 配置读取与严格校验，agent 目录与 runs 目录布局 | `index.ts` |
| [`herdr`](modules/herdr.md) | herdr 本地 Socket 客户端：NDJSON 传输 + 九个命令的窄接口 | `index.ts` `socket.ts` `endpoint.ts` |
| [`run`](modules/run.md) | run 生命周期：纯函数判定、内存状态表、spawn / steer / stop / 结算 | `index.ts` 加 13 个职责文件 |
| [`tool`](modules/tool.md) | 模型面：主子两套参数 schema、文案、错误渲染 | `index.ts` `schema.ts` `input.ts` `text.ts` |
| [`extension`](modules/extension.md) | 深度分流装配、子侧落盘、结算投递、收尾清理 | `index.ts` `main.ts` `child.ts` `deliver.ts` `types.ts` |

入口不是模块。它在加载时读一次 `PI_SUBAGENT_DEPTH`、`PI_SUBAGENT_RUN_DIR`、`HERDR_SOCKET_PATH`，把值注入 `createExtension`。

## 3. 依赖方向

~~~text
index -> extension
index -> config
index -> herdr
extension -> tool
extension -> run
extension -> herdr
extension ..> config  (type-only)
tool -> run
tool ..> config       (type-only)
run -> herdr
run -> config
~~~

- 只能沿箭头依赖，禁止反向 import。`config`、`herdr` 是叶子。
- `config` 只认 Node fs/os/path，不 import pi；配置错误只有一条带字段名的 Error。
- `herdr` 只认 Node net，不知道 run、工具与状态机。
- `run` 不 import pi。`extension` 不构造真实 Socket。只有 `index.ts` 把环境变量、Socket 客户端与 pi 装配到一起。
- 宿主包 `@earendil-works/pi-coding-agent` 只做 type-only import。`typebox` 只在 `tool/schema.ts` 与 `tool/input.ts`。
- 上述边与单一出口由仓库根的 `scripts/check-imports.mjs` 执行（`pnpm check:imports`）。改图时同步改本包 `scripts/import-graph.mjs` 的 `edges` / `singleImport`。

## 4. 测试 seam

`test/` 按被测模块分目录：`config/` `herdr/` `run/` `tool/` `extension/`。装配与组合根的测试是 `test/index.test.ts`。共享夹具放 `test/support/`。一个文件一个行为面，单文件同样 150 行上限。

| seam | 用法 | 覆盖 |
|---|---|---|
| `run/rules.ts` | 纯函数，表驱动，零 mock | id 校验、状态迁移、槽位、信封截断 |
| `createRunService` + fake `HerdrClient` + 临时 runs 目录 | 注入 fake client，手动 resolve `agent.wait`，真实 fs 写 `result.json` | spawn、steer 打断与超时兜底、stop 幂等、done 自动关 pane、worktree 回滚、pane 消失兜底、无 result 兜底 |
| `createTransport` / `createHerdrClient` + 假本地 Socket | 真实 named pipe / UDS 上跑假服务端，逐行 JSON-RPC | 结果帧、错误码、超时、断线重连、命令参数映射 |
| fake pi 扩展 API | `test/support/fake-pi.ts` 记录注册与投递，手动触发事件 | 深度分流、`turn_end` 落盘、`request_input`、`deliverAs: followUp` 投递、收尾关 pane |
| `loadConfig` / `writeChildResult` / `pruneRuns` | 临时目录 + 真实 fs | 默认值、严格校验、seq 单调、原子替换、超限落盘、过期清理 |

mock 只有两处：注入的 `HerdrClient`、fake pi 扩展 API。不 mock 模块内部，不 mock Node fs。真实 herdr 行为变化时，先补[研究记录](research/README.md)再改代码。

## 5. 文档职责

| 文件 | 只写 | 不写 |
|---|---|---|
| `README.md` | 功能、要求、安装、用法、配置、文档索引、开发、许可 | 模块签名、选型理由 |
| `docs/ARCHITECTURE.md` | 模块边界、依赖方向、命名与拆分规则、测试 seam、文档规则、模块索引 | 字段表、决策理由、进度、模块用法 |
| `docs/decisions/*.md` | 决策编号、理由、取消项、边界，一条一份 | 字段表、配置、命令行 |
| `docs/specs/*.md` | 对外配置、工具、状态机、失败模式 | 决策理由、内部签名 |
| `docs/GLOSSARY.md` | 本扩展特有术语的唯一命名来源 | 实现细节 |
| `docs/modules/*.md` | 单个模块的用法与取舍 | 依赖方向、契约字段表 |
| `docs/research/*.md` | 外部实测与参考记录，索引在 [research/README.md](research/README.md) | 当前契约 |

归属冲突时以本表裁决。跨文档只允许指针，不允许复述。

## 6. 约束

- 扩展本体零 UI 渲染、零自定义队列、零轮询；状态展示交给 herdr 侧边栏。
- 不往主会话每轮注入上下文快照（保护前缀 KV Cache）。
- 交付前 QA 跑 `pnpm check`，组成见 `package.json`。
