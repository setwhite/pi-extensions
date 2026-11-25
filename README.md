# pi-extensions

五个独立发布的 pi 扩展。装哪个都行，互不依赖。

| 包 | 做什么 | 额外要求 |
|---|---|---|
| [`pi-web-search-lite`](packages/pi-web-search-lite) | `web_search` + `web_fetch`，可配 provider 与抓取链 | 一个搜索源的 key |
| [`pi-todo-lite`](packages/pi-todo-lite) | 角落浮窗里一张有序任务表，不占对话行数 | 无 |
| [`pi-herdr-subagents-lite`](packages/pi-herdr-subagents-lite) | 在 herdr 分格里跑 pi 子代理 | herdr，父会话跑在 pane 里 |
| [`pi-browser-use-lite`](packages/pi-browser-use-lite) | 5 个 `chrome_*` 工具，经本地桥驱动你已登录的真实浏览器 | Chromium 系浏览器，手动加载扩展 |
| [`pi-ask-question-lite`](packages/pi-ask-question-lite) | `ask` 一次问 1–4 题：单选、多选、就地补充，Esc 一次中止 | 无 |

## 安装

```sh
pi install npm:<包名>              # 包名见上表
pi install ./packages/pi-todo-lite # 从工作区装，不经过 npm
```

pi 的 git 安装只认仓库根，指不到子目录。所以发布版只能从 npm 装。

## 开发

### 环境

需要 Node `>= 22.19` 与 pnpm。根 `package.json` 的 `packageManager` 固定 pnpm 版本。

```sh
pnpm install # 在仓库根装一次，五个包共用 pnpm-lock.yaml
```

### 全仓检查

四条闸都在仓库根跑。

```sh
pnpm check         # 四条按序跑一遍
pnpm lint          # biome 查格式与 lint，warning 也算失败
pnpm check:imports # 按各包 scripts/import-graph.mjs 校验依赖方向与单一出口
pnpm typecheck     # 各包 tsc --noEmit
pnpm test          # vitest 跑测试，全程不访问网络
```

格式与 lint 可自动修正：

```sh
pnpm -r --no-bail lint:fix # 自动修正格式与 lint
```

### 单包与 E2E

只改一个包时，优先在那个包里跑 `check`，四条闸一次过：

```sh
pnpm -C packages/<pkg> check                      # 单包四闸：lint / imports / typecheck / test
```

只有改根配置（`package.json`、`biome.json`、`tsconfig`）、共享脚本（`scripts/`、`.githooks/`）或 `pnpm-lock.yaml` 时，才回根跑 `pnpm check`。

```sh
pnpm -C packages/pi-todo-lite test                # 只跑单包测试
pnpm -C packages/pi-web-search-lite test:e2e      # 真网络，需要 provider key
pnpm -C packages/pi-herdr-subagents-lite test:e2e # 真 herdr + 真 pi 子进程
pnpm -C packages/pi-browser-use-lite test:e2e     # 已开着的浏览器 + 已装好的扩展
```

E2E 不进 `pnpm check`，也不进 CI。web-search 的 e2e 需要 provider key 与外网。herdr 的 e2e 自己起隔离的 herdr session 与 agent 目录。缺 herdr、pi 或 `auth.json` 时，整组跳过并打印原因。browser-use 的 e2e 不启动浏览器：它连一个已开着、已手动 load unpacked 装好扩展的浏览器。

```sh
export PI_E2E_MODEL=<model> # herdr e2e 换模型
export PI_E2E_KEEP=1        # 保留 e2e 临时目录
```

### 钩子与 CI

```sh
git config core.hooksPath .githooks # 启用提交钩子
```

pre-commit 只跑静态三闸（`pnpm lint`、`pnpm check:imports`、`pnpm typecheck`），秒级结束，不跑测试。提交前想连测试一起过，跑单包 `pnpm -C packages/<pkg> check`。

CI 在 Linux（Node 22 / 24）与 Windows（Node 22）上跑完整四闸，见 [ci.yml](.github/workflows/ci.yml)。

## 发版

改 `packages/<pkg>/package.json` 的 version，然后推 main。`npm-publish.yml` 对五个包各判断一次，只发布版本号变了的包。

## 文档

每个包的 `docs/` 跟代码同仓，不进 npm 包，只在 GitHub 读。

| 位置 | 写什么 | web-search | todo | herdr | browser-use | ask |
|---|---|---|---|---|---|---|
| `docs/ARCHITECTURE.md` | 模块、依赖方向、测试 seam | ✓ | ✓ | ✓ | ✓ | ✓ |
| `docs/GLOSSARY.md` | 术语的唯一命名来源 | ✓ | ✓ | ✓ | ✓ | ✓ |
| `docs/modules/` | 单模块的取舍与坑 | ✓ | — | ✓ | ✓ | — |
| `docs/decisions/` | 一条决策一份文件 | ✓ | ✓ | ✓ | ✓ | ✓ |
| `docs/specs/` | 对外契约 | — | ✓ | ✓ | ✓ | ✓ |
| `docs/research/` | 外部实测记录 | — | — | ✓ | ✓ | ✓ |
| `docs/audit/` | 验收记录，一次一份 | — | — | — | — | ✓ |
| `docs/todos/` | 实施清单 | — | — | — | — | ✓ |

仓库级决策在 [docs/decisions/](docs/decisions/)：为什么合并成一个仓库。

约定：README 有中英两版。`docs/` 用中文。模型可见文案用英文。决策一条一文件，正文引用写 `DEC-0001`，索引在各 `decisions/README.md`。
