# 0002 参考仓库留在包内 _repos/

## 问题

`_repos/pi-chrome` 与 `_repos/bladebro`（合计约 68 MB）放在哪里。

## 选项

1. 移到包目录外。
2. 留在 `packages/pi-browser-use-lite/_repos/`。

## 选了

2。

## 理由

用户要求留在原处。

副作用已核：

- 根 `.gitignore` 已列 `_repos/`。biome 的 `vcs.useIgnoreFile` 为 true，因此 `pnpm lint` 跳过。
- 新包 `tsconfig.json` 的 `include` 只覆盖 `src/`、`test/` 与 `vitest.config.ts`，并显式 `exclude` 掉 `_repos`。pi-chrome 的 `index.ts` 不进编译单元。
- 新包 `files` 不列 `_repos`，不进发布产物。
