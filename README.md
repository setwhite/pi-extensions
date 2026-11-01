# pi-extensions

三个独立发布的 pi 扩展，一个仓库维护。

| 包 | 做什么 | 文档 |
|---|---|---|
| [`pi-web-search-lite`](packages/pi-web-search-lite) | `web_search` + `web_fetch`，可配 provider 与抓取链 | [README](packages/pi-web-search-lite/README.md) |
| [`pi-todo-lite`](packages/pi-todo-lite) | 编辑器上方一张有序任务表 | [README](packages/pi-todo-lite/README.md) |
| [`pi-herdr-subagents-lite`](packages/pi-herdr-subagents-lite) | 在 herdr 分格里跑 pi 子代理 | [README](packages/pi-herdr-subagents-lite/README.md) |

## 安装

pi 的 git 安装只认仓库根，无法指向子目录（`GitSource` 只有 repo 与 ref），所以三个包都从 npm 装：

```sh
pi install npm:pi-web-search-lite
pi install npm:pi-todo-lite
pi install npm:pi-herdr-subagents-lite
```

本地开发时可以直接装子目录：`pi install ./packages/pi-todo-lite`。

## 文档

- [pi-web-search-lite](packages/pi-web-search-lite/docs/) — 架构、术语、模块、ADR
- [pi-todo-lite](packages/pi-todo-lite/docs/) — 同上
- [pi-herdr-subagents-lite](packages/pi-herdr-subagents-lite/docs/) — 同上
- [ADR](docs/adr/) — 仓库级决策：为什么合并、为什么不抽共享包

## 开发

```sh
pnpm install
pnpm check     # lint + check:imports + typecheck + test，三个包各跑一遍
```

单包命令用 `pnpm -C`：`pnpm -C packages/pi-todo-lite test`。

CI 在 Linux（Node 22 / 24）与 Windows（Node 22）上跑三个包的 lint / check:imports / typecheck / test。`.gitattributes` 把行尾固定为 LF，pnpm 版本由 `packageManager` 固定。

提交前启用钩子（仓库内生效，不写全局配置）：`git config core.hooksPath .githooks`。钩子跑同样四条命令，覆盖三个包，约 30 秒。

## 发版

把某个包的 `package.json` 版本号改掉并推 main。`publish.yml` 对三个包各判断一次：版本号变了且 registry 上没有这一版的才发，其余跳过。
三个包版本各自独立，互不牵连。

## 布局

```
packages/
  pi-web-search-lite/          源码在包根，test/ 与 docs/ 不进包
  pi-todo-lite/                src/
  pi-herdr-subagents-lite/     src/ + e2e/（需本机 herdr，不进 CI）
```

包之间没有代码依赖，也没有共享运行时包：pi 的包在独立 module root 里加载，共享依赖实例不可靠。
共享的只有仓库级基础设施——lockfile、CI、发布、import 图闸、行尾策略。
