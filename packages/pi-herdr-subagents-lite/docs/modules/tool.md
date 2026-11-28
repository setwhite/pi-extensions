# tool

模型面。主子两侧各一套工具：主侧 `subagent`（`spawn` / `steer` / `inspect` / `stop`），子侧 `request_input`。`face.ts` 是唯一决定「什么能进模型面」的地方。

## 用法

~~~ts
import { createSubagentTool, createRequestInputTool } from "../tool/index.ts";

pi.registerTool(createSubagentTool({ config, service: () => service }));
pi.registerTool(createRequestInputTool({ runDir, summaryMaxChars: config.summaryMaxChars }));
~~~

- 参数 schema 用 `typebox` 表达，四个动作合成一个 `oneOf`。
- `execute` 只做两件事：调 `run` 服务、把返回包成 `content` + `details`。
- `ToolError` 渲染成 `"<code>: <message>"`，`isError: true`；其它异常直接抛出。`ToolError` 的 message 由服务层用 `run/errors.ts` 的 `errorText` 拼：pane id 与本机路径替换成 `<pane>` / `<path>`（[DEC-0074](../decisions/0074-model-face-without-paths.md)）。
- `spawn` 的 `content` 是 JSON 一行加一句 `SPAWN_NOTE`：id / status 之后立刻提醒「别重复干活」。其它动作只回 JSON。
- 不在 herdr 里（`HERDR_ENV !== "1"`）时返回 `not_in_herdr`，没有降级路径。
- `request_input` 把问题写进 `result.json` 并提示结束回合，不弹任何 UI。

## 取舍

- `content` 只放白名单投影后的 JSON（`face.ts`）：`paneId`、`runDir`、`sessionFile` 一律不外泄，服务层加字段默认不露面（[DEC-0074](../decisions/0074-model-face-without-paths.md)）。`details` 与 `content` 同一份 payload，今天没有渲染方。
- 子代理默认不注册 `ask`：`spawn` 按配置 `excludeTools`（默认 `["ask"]`）拼 `--exclude-tools`，空数组时不传，从源头防止子 pane 弹表单打断人类。
