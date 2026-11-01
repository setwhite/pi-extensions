# 0022 新 tab 或新 workspace

同 workspace 开新 tab；cwd 不同则新 workspace；不 split 父 pane。

依据：split 会让父 TUI reflow。

## 修订：新 workspace 复用初始 tab

`workspace create` 返回时已经带一个 tab；再 `tab create` 会留下一个空 tab，而且关掉 workspace 的最后一个 tab 会连带删除该 workspace。改为复用初始 tab，只把它的 label 从序号改成 `name`（[实测](../research/0004-herdr-workspace-create.md)）。
