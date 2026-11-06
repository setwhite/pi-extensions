# 0001 工程与配置对齐同仓库其他包

## 问题

新包自己定工程规范，还是照搬同仓库其他包。

## 选项

1. 照 `pi-web-search-lite` / `pi-todo-lite`：pnpm、biome、tsc、vitest、`scripts/import-graph.mjs`、`config.json` 契约。
2. 自定规范。

## 选了

1。

## 理由

仓库根 `scripts/check-imports.mjs` 与根 `pnpm lint`/`test`/`typecheck` 已按这套驱动。自定规范要改根配置。
