# 0010 包名与目录改为 `pi-ask-question-lite`

## 决定

- npm 包名与仓库目录都叫 `pi-ask-question-lite`（目录 `packages/pi-ask-question-lite`）。
- 工具名仍是 `ask`，配置路径仍是 `~/.pi/agent/pi-ask/config.json`，报错前缀仍是 `pi-ask`。

## 为什么

`pi-ask-lite` 已被别人发布，我们发不了：

```
$ npm view pi-ask-lite
pi-ask-lite@0.1.4   maintainers: geri1701   repo: github.com/geri1701/pi-ask-lite

$ npm view pi-ask-question-lite
npm error code E404
```

其余四个包都用 `pi-*-lite` 扁平名，`pi-ask-question-lite` 保持同一套命名，安装方式不变（`pi install npm:<包名>`），比开 scope 更贴近现有四个包。查证时间 2026-11-25。

## 代价

- 名字长：README 标题和 `pi install` 命令行都变长。
- npm 上有近名 `pi-ask-question@0.1.0` 与 `@fitchmultz/pi-ask-question`，搜到彼此的概率高。
- 包名、工具名、配置目录三者不同名：`pi-ask-question-lite` / `ask` / `pi-ask`，只能靠 README 讲清，改名时容易漏掉其中一处。
- 文档文件名（spec / audit / todos）跟着改，编号不变，但仓库外指向旧文件名的链接会失效。
