# 0001 工具面成本

## 结论

pi-chrome 的工具面约是 bladebro 的两倍。收束到 5 个工具可行。

## 依据

实测方法：用 node 读源码，提取 `description:` 与 `"description":` 后的字符串字面量，按字符计数。模板字面量单独计。

**pi-chrome** — `_repos/pi-chrome/extensions/chrome-profile-bridge/index.ts`

| 项 | 数量 | 字符 |
| --- | --- | --- |
| 工具 | 23 | — |
| 工具级 `description` | 23 | 7,684 |
| 参数级 `description` | 96 | 5,598 |
| `promptSnippet` | 23 | 1,853 |
| `CHROME_PRIMER` | 1 | 4,016 |
| **合计** | | **19,151** |

**bladebro** — `_repos/bladebro/src/mcp/tools.rs`

| 项 | 数量 | 字符 |
| --- | --- | --- |
| 工具 | 5 | — |
| 工具级 `description` | 5 | 3,554 |
| 参数级 `description` | 72 | 5,919 |
| 服务器 `INSTRUCTIONS` | 1 | 见 `src/mcp/server.rs:79` |

bladebro 有体积守卫，原文与位置 `src/mcp/tools.rs:303-305`：

```rust
// The 4.6.6 tool list was 15,463 serialized UTF-8 characters. Keep
// missing-input fixes within that budget instead of duplicating schemas.
assert!(serde_json::to_string(&tools).unwrap().chars().count() <= 15463);
```

**公共参数在 pi-chrome 里重复声明。** 计单位为 23 个工具块内出现的次数：

| 参数 | 次数 |
| --- | --- |
| `targetId` | 22 |
| `urlIncludes` | 22 |
| `titleIncludes` | 22 |
| `background` | 19 |
| `port` | 16 |
| `host` | 15 |
| `maxElements` | 9 |
| `uid` | 8 |
| `selector` | 8 |

## 设计原则（原文）

bladebro `AGENTS.md:52`：

> **Five tools. Forever.** `act`, `see`, `state`, `run`, `vision`. New capabilities are parameters or behaviors of those five — never a sixth tool.

bladebro `src/mcp/tools.rs:3-6`：

> Design (D5): few tools, full control. Five tools, not twenty. ... Descriptions are hand-crafted for LLM token efficiency: every token serves the agent's decision of which tool to call and how to parameterize it. No redundancy between description and schema.

## 未决问题

无。
