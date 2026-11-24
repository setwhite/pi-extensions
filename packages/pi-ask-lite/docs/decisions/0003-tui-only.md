# 0003 只支持 TUI：`mode` 不是 `tui` 就报错

## 决定

`ctx.mode !== "tui"` 时 `ask` 抛错，不挂组件、不发 `herdr:blocked`，不做回退。

## 为什么

- RPC 模式下 `hasUI` 是 `true`，但 `ui.custom()` 直接返回 `undefined`（`pi-coding-agent/docs/rpc-extension-ui.md`）。按 `hasUI` 判定会拿到空结果，还得处理「看起来能问、其实问不了」。
- 真要做回退，得另开一条答题通道（文件、HTTP、socket）。那是另一个产品，不是这个包的边界。

## 代价

- RPC 与 `-p` 下模型调 `ask` 会拿到错误结果。错误文案必须明确「换到 TUI 再用，不要重试」。
- 以后宿主把 `custom()` 的 RPC 协议补上，这条要新开决策取代。
