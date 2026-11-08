# pi-extensions

四个独立发布的 pi 扩展。

| 包 | 做什么 |
|---|---|
| [`pi-web-search-lite`](packages/pi-web-search-lite) | `web_search` + `web_fetch`，可配 provider 与抓取链 |
| [`pi-todo-lite`](packages/pi-todo-lite) | 编辑器上方一张有序任务表 |
| [`pi-herdr-subagents-lite`](packages/pi-herdr-subagents-lite) | 在 herdr 分格里跑 pi 子代理 |
| [`pi-browser-use-lite`](packages/pi-browser-use-lite) | 5 个 `chrome_*` 工具，经本地桥驱动你已登录的真实浏览器 |

## 安装

四个包都用 `pi install npm:<包名>` 安装。包名见上表。

只能从 npm 安装。pi 的 git 安装只认仓库根，指不到子目录。

## 开发

### 环境

需要 Node `>= 22.19` 与 pnpm。根 `package.json` 的 `packageManager` 固定 pnpm 版本。

```sh
pnpm install # 在仓库根装一次，四个包共用 pnpm-lock.yaml
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

```sh
pnpm -C packages/pi-todo-lite test                # 单包测试
pnpm -C packages/pi-web-search-lite test:e2e      # 真网络，需要 provider key
pnpm -C packages/pi-herdr-subagents-lite test:e2e # 真 herdr + 真 pi 子进程
pnpm -C packages/pi-browser-use-lite test:e2e     # 已开着的浏览器 + 已装好的扩展
```

E2E 不进 `pnpm check`，也不进 CI。web-search 的 e2e 需要 provider key 与外网。herdr 的 e2e 自己起隔离的 herdr session 与 agent 目录。缺 herdr、pi 或 `auth.json` 时，整组跳过并打印原因。browser-use 的 e2e 不启动浏览器：它连一个已开着、已手动 load unpacked 装好扩展的浏览器。

```sh
export PI_E2E_MODEL=<model> # herdr e2e 换模型
export PI_E2E_KEEP=1        # 保留 e2e 临时目录
```

从工作区直接安装扩展，不经过 npm：`pi install ./packages/pi-todo-lite`。

### 钩子与 CI

CI 在 Linux（Node 22 / 24）与 Windows（Node 22）上跑同样四条，见 [ci.yml](.github/workflows/ci.yml)。

```sh
git config core.hooksPath .githooks # 启用提交钩子，钩子跑同样四条
```

## 发版

改 `packages/<pkg>/package.json` 的 version，然后推 main。`npm-publish.yml` 对三个包各判断一次，只发布版本号变了的包。

## 文档

| 位置 | 内容 |
|---|---|
| `packages/<包名>/docs/` | 该包的架构、术语、模块与 ADR。不在 npm 包里，只在 GitHub 可读。 |
| [docs/adr/](docs/adr/) | 仓库级决策：为什么合并，为什么不抽共享包。 |
