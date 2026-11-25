# 0005 多选显式 Confirm 行

> 后续：[0006](0006-drop-space-toggle.md) 去掉了 `Space`，多选只留 `Enter` 与数字键。

## 决定

多选里 `Enter`、`Space`、数字键 `1–9` 都只切换勾选，不再推进。收题要多选末尾的 `→ Confirm` 行：移过去按 `Enter`。`Tab` / `→` 仍然切题，`keys.submitEarly`（默认 `Ctrl+Enter`）仍然随时提前提交。

## 为什么

- `Enter` 同时承担「勾选」和「收题」两个语义，勾第一项时经常被直接送到下一题。一按 `Enter` 就跳过本题是上一版最容易误触的地方。
- 单独一个 Confirm 行把「给这道题收尾」变成可见、可聚焦的动作，和 Custom 行并列，不额外占底部键位。
- 老路径都留着：`Tab` / `→` 切题，`Ctrl+Enter` 提前提交，Esc 中止。多选仍然只按一次键就能改勾选。

## 代价

- 多选多一行；高度紧时靠裁剪窗口先保焦点项，Confirm 可能被裁掉（这时还有 `Tab` 和 `Ctrl+Enter`）。
- Confirm 空着按会把该题记进 `skipped`，部分提交的口子从一条变两条（另一条是 `submitEarly`）。
