- [x] 已完成
- Spec: docs/specs/0001-pi-ask-question-lite.md
- 验收: AC1、AC2、AC3、AC4、AC5、AC6、AC7

## 交付物

- 包骨架：`package.json`（`pi.extensions` 指 `./src/index.ts`）、`tsconfig.json`、`vitest.config.ts`、`biome.json`、`scripts/import-graph.mjs`、`CHANGELOG.md`
- `src/config.ts`：读 `pi-ask-question-lite/config.json`、默认值、校验、比例夹取、`tool-name` 占位
- `src/schema.ts`：`Question` / `Option` 解析，硬错误带字段路径
- `src/state.ts`：`Phase` / `Outcome` 迁移、推进、`submit`、`submitEarly`、`abort`
- `src/view.ts`：行渲染、宽度截断、高度预算、并排/堆叠、键提示
- `src/index.ts`：注册工具（`exposure: "model-only"`）、`mode` 闸、`herdr:blocked` 配对、`custom()` 组件与 `done`
- `test/`：`config`、`schema`、`state`、`view`、`index`、`package`、`docs` 七个文件
- `README.md` 与 `README.zh-CN.md`：用法、键位、配置节（两份配置块都要与 `DEFAULTS` 一致）

## 前置

- 新包的 devDependencies 与 pi-todo-lite 同版本，`pnpm install` 会多一个 importer、动锁文件。执行前找你确认。
- `view.ts` 要用的 pi-tui 组件（`Markdown`、`Input`、`Editor`）先对 `pi-tui/dist/index.d.ts` 核签名。缺件就自绘，不加依赖。
