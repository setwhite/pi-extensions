# herdr

herdr 本地 Socket 的窄客户端。上层只认 `HerdrClient` 接口，不认 JSON 帧。

## 用法

~~~ts
import { createHerdrClient, socketEndpoint } from "../herdr/index.ts";

const client = createHerdrClient(socketEndpoint(process.env.HERDR_SOCKET_PATH ?? ""));
await client.startAgent({ name: "alpha", paneId: "w1:p2", args: ["--session", "/sessions/alpha/session.jsonl"] });
~~~

- 传输是逐行 JSON：`{id, method, params}` 进，`{id, result}` 或 `{id, error}` 出。
- Windows 上 `HERDR_SOCKET_PATH` 只是管道名，`socketEndpoint` 补 `\\\\.\\pipe\\\\` 前缀；Unix 直接用路径。
- herdr 每回完一条请求就关连接，所以客户端一请求一连接；`close()` 只销毁还在途的 socket。
- `closePane` 把 `pane_not_found` 当成功，关 pane 天然幂等。

## 取舍

- 不用 `events.subscribe`：订阅带 `pane_id`，pane 失效会让服务端关掉整条连接。完成通知改用 `agent.wait` 长请求，服务端事件驱动，无轮询也无重连对账。见 [DEC-0071](../decisions/0071-completion-by-agent-wait.md)。
- 不用 CLI 子进程：`execFile("herdr", ...)` 每次一个进程，Socket 一次连接搞定。
- 环境变量注入不在 `agent.start` 上（它没有 `env` 字段），而在建 pane 的 `tab.create` / `pane.split` 上。见[研究记录 0007](../research/0007-herdr-socket-api.md)。
- `getAgent` 不是可有可无的查询：herdr 只在 `agent.get` 里推进托管 agent 的启动状态，不轮询就永远 prompt 不了。见 [DEC-0073](../decisions/0073-agent-get-readiness-poll.md)。
