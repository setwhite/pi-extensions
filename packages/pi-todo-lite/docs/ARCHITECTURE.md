# 架构 · pi-todo-lite

## 模块

源码全在 `src/`，平铺不建子目录。测试在 `test/`，按模块镜像。包根只放配置与文档。

| 文件 | 职责 |
|---|---|
| `src/index.ts` | 入口（`package.json` 的 `pi.extensions`）与接线：读配置 → 注册工具、命令、事件、快捷键 → 调 `setWidget` / `appendEntry`。`/todos import` 与 `/todos export` 的文件 IO 只在这里 |
| `src/plan.ts` | 计划语义：类型、校验、回放、给模型的文本。不 import 任何东西 |
| `src/view.ts` | 显示与文本：widget 行、`/todos` 文本、markdown 导出与解析。只从 `plan.ts` 取类型 |
| `src/config.ts` | 读 `config.json`、默认值、校验、clamp。只碰 `node:fs` / `node:path` / `node:os` |

## 依赖方向

依赖只能从左往右。反向引用不允许。

| 从 | 可以引用的本地文件 |
|---|---|
| `src/config.ts` | 无 |
| `src/plan.ts` | 无 |
| `src/view.ts` | `src/plan.ts`（只取类型） |
| `src/index.ts` | `src/config.ts`、`src/plan.ts`、`src/view.ts` |

单一出口不在这里复述。宿主包、`typebox`、`node:` 各允许出现在哪个文件，见本包 `scripts/import-graph.mjs` 的 `singleImport`。同一张表的 `edges` 由仓库根 `scripts/check-imports.mjs` 执行上面这张表（`pnpm check:imports`）。改图时两边一起改。

为什么这么切：这三个文件不 import 宿主包。入参出参都是普通值。所以测试不用 mock 宿主。

## 放置规则

- 语义与校验 → `plan.ts`。
- 显示与文本 → `view.ts`。
- 配置键 → `config.ts`（四处同改，见 [`D04`](decisions/D04-config-read-only.md)）。
- 只有注册、调宿主与 `/todos import` / `export` 的文件 IO 才碰 `index.ts`。

`src/` 下不建 `utils.ts` / `types.ts` / `constants.ts`。类型跟着用它的模块走。

## 不变量

`content` 由 `plan.ts` 在数据入口验成单行纯文本。所以下游渲染不必再清终端控制字符，也不必防一条变多行。

报错消息只回显形状，不回显正文。字符串超 32 个 code point 截断。容器只说类型与键名。

## 刻意的重复（别急着抽）

`formatTasks` 的进度行与 widget 表头各一份模板。`describe` / `echo` 在 `config.ts` 与 `plan.ts` 各一份。重复到第三次再抽。

README 的配置示例故意抄一份 `DEFAULTS`。`test/docs.test.ts` 逐字对账。用户不读源码，漂移靠测试拦（见 [`D04`](decisions/D04-config-read-only.md)）。

## 文档职责

| 文件 | 只写 | 不写 |
|---|---|---|
| `README.md` / `README.zh-CN.md` | 是什么、功能、安装、配置、用法 | 模块签名、决策理由 |
| `docs/specs/0001-pi-todo-lite.md` | 契约：用户故事、协议、验收表、不做的清单 | 字段表、模块划分 |
| `docs/ARCHITECTURE.md` | 模块、依赖方向、放置规则、不变量、本表 | 字段表、决策理由 |
| `docs/decisions/` | 背景、定成什么、为什么、代价 | 字段表、契约细节 |
| `docs/GLOSSARY.md` | 术语的唯一命名来源 | 实现细节 |
| `CHANGELOG.md` | 各版本的用户可见变更 | 契约与理由 |

内容归属冲突时以本表裁决。跨文档只允许指针，不允许复述。
