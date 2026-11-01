# 三个 pi 扩展并成一个 monorepo

三个包各自一个仓库时，同一套东西复制三份：CI、发布、本地钩子、import 图闸、tsconfig、lockfile、行尾策略。三份 pi 宿主版本也随之漂移（`@earendil-works/pi-coding-agent` 分别停在 1.1.0 / 1.3.0 / 1.4.0）。合并成一个仓库、三个包继续独立发版，基础设施收成一份，宿主版本收成一个。

代价：pi 的 git 安装无法指向子目录（`GitSource` 只有 `repo` 与 `ref`，安装流程只看克隆根的 `package.json`），三个 README 里的 `git:` 安装行作废，只能从 npm 装。三个旧仓归档只读，已装的 git 源继续可用但不再更新。

不做的：不抽共享运行时包（pi 的包在独立 module root 里加载，共享依赖实例不可靠，跨包依赖还必须打进 tarball）；不统一代码风格（三个包格式不同，靠嵌套 biome 配置 `"root": false` 原样保留，避免纯格式化 diff 毁掉 blame）；不统一 tsc 严格档（把 herdr 的 `noUncheckedIndexedAccess` / `verbatimModuleSyntax` / `erasableSyntaxOnly` 加到 web-search 会引出 97 个类型错误，属于独立重构）。
