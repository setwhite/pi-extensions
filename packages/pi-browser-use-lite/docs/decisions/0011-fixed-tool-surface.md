# 0011 工具面固定为 5 个

工具面固定为 5 个：`chrome_act`、`chrome_see`、`chrome_tab`、`chrome_vision`、`chrome_cdp`。新能力只能是这 5 个的参数或动作，不新增第 6 个工具。

pi-chrome 的 23 个工具实测 19,151 字符（见 [RESEARCH-0001](../research/0001-tool-surface-cost.md)）。公共参数在每个工具里重复声明，模型难以选择。

Considered Options：保留 23 个（只做代码模块化）；4 个（`cdp` 并进 `act`）；6 个（`cdp_targets` 单独留）。选 5 个，与 bladebro 的 `AGENTS.md:52`「Five tools. Forever」一致。
