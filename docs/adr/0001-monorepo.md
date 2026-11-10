# 0001 三个 pi 扩展并成一个 monorepo

三个包原来各有一个仓库。同一套基础设施因此复制三份：CI、发布、本地钩子、import 图闸、tsconfig、lockfile、行尾策略。三个包的 pi 宿主版本也随之漂移：`@earendil-works/pi-coding-agent` 分别停在 1.1.0 / 1.3.0 / 1.4.0。

现在三个包在同一个仓库。三个包仍各自独立发版。基础设施只有一份。宿主版本只有一个。

后来的 `pi-browser-use-lite` 直接建在本仓库，没有独立旧仓，所以不在这段迁移里。四个包共用同一份基础设施。

代价：pi 的 git 安装指不到子目录。`GitSource` 只有 `repo` 与 `ref`。安装流程只看克隆根的 `package.json`。所以三个 README 里的 `git:` 安装行作废，只能从 npm 装。三个旧仓归档为只读。已装的 git 源还能用，但不再更新。

不做的：

- 不抽共享运行时包。pi 的包在独立的 module root 里加载，共享依赖实例不可靠。跨包依赖还必须打进 tarball。
- 不统一代码风格。三个包的格式不同。用嵌套 biome 配置 `"root": false` 原样保留，避免纯格式化 diff 毁掉 blame。
- 不统一 tsc 严格档。把 herdr 的 `noUncheckedIndexedAccess` / `verbatimModuleSyntax` / `erasableSyntaxOnly` 加到 web-search 会引出 97 个类型错误。这属于独立重构。
