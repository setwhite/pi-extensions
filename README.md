# pi-extensions

三个独立发布的 pi 扩展。

| 包 | 做什么 |
|---|---|
| [`pi-web-search-lite`](packages/pi-web-search-lite) | `web_search` + `web_fetch`，可配 provider 与抓取链 |
| [`pi-todo-lite`](packages/pi-todo-lite) | 编辑器上方一张有序任务表 |
| [`pi-herdr-subagents-lite`](packages/pi-herdr-subagents-lite) | 在 herdr 分格里跑 pi 子代理 |

## 安装

```sh
pi install npm:pi-web-search-lite
pi install npm:pi-todo-lite
pi install npm:pi-herdr-subagents-lite
```

只从 npm 装：pi 的 git 安装只认仓库根，无法指向子目录。

## 开发

```sh
pnpm install
pnpm check                            # 三包各跑 lint + check:imports + typecheck + test
pnpm -C packages/pi-todo-lite test    # 单包
pi install ./packages/pi-todo-lite    # 直接从工作区装
```

CI 在 Linux（Node 22 / 24）与 Windows（Node 22）上跑 `pnpm check`，见 [ci.yml](.github/workflows/ci.yml)。

钩子（可选，仓库内生效）：`git config core.hooksPath .githooks`。

## 发版

改 `packages/<pkg>/package.json` 的 version 并推 main。`publish.yml` 对三个包各判断一次，只发版本号变了的。

## 文档

- 各包的架构、术语、模块、ADR：`packages/<pkg>/docs/`
- 仓库级决策：[docs/adr/](docs/adr/)
