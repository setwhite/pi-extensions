# 0004 Chrome 扩展用 ES module service worker

## 问题

`service_worker.js` 单文件 3,481 行。要不要拆。

## 选项

1. manifest 的 `background` 加 `"type": "module"`，拆成 `background/` 下的 ES 模块。
2. 保持单文件。

## 选了

1。

## 理由

Chrome 支持模块 service worker。拆分后单文件上限降到约 300 行，且能按职责分工。

连带影响：

- 页面注入代码仍必须是自包含单文件，不能拆。它们被字符串化或 `Runtime.evaluate` 送进页面。
- 现有 13 个单测（3,083 行）用 `node:vm` 直接 eval `service_worker.js` 文本，必须改成「先挂 `globalThis.chrome` 桩，再动态 `import()`」。
- 不加构建步骤。仍零依赖。
