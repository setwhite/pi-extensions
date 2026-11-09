# RFC 0001 拆 bridge

状态：已批准，已实施（[DEC-0015](../decisions/0015-split-bridge.md)）。

## 问题

`src/bridge/index.ts` 有 721 行、一个 `Bridge` 类、六组职责。它是全包唯一有真并发的地方：命令队列、waiter 唤醒、端口选举、升级、超时、版本闸都在一个文件里。正确性目前靠读代码保证。

| 区段 | 行 | 职责 |
|---|---|---|
| 类型与常量 | 33-79 | `BridgeOptions`、`SendOptions`、`PendingEntry`、`Waiter` |
| 绑端口与选举 | 116-184、407-441 | `start`、`bindAsClientOrFail`、`takePort`、`askOwnerStatus` |
| 生命周期与状态 | 185-250 | `stop`、`status`、`describe`、`waitForFirstPoll` |
| 发命令 | 252-389 | `send`、`sendLocal`、`sendViaOwner` |
| 升级 | 390-406 | `promoteToServer` |
| HTTP 面 | 443-564 | `handle`、`handleCommand`、`handleNext` |
| 队列与在途 | 565-588、611-639 | `waitForCommand`、`expire`、`timeoutReason`、`fail`、`retire` |
| 版本闸 | 589-610 | `recordExtensionVersion`、`handleResult` |
| 模块级工具 | 640-721 | `sendJson`、`bridgeErrorFrom`、origin 校验、`isOwnerUnreachable`、`readBody` |

## 目标

1. 让「谁拥有端口」与「命令怎么排队」各自可单独读、单独测。
2. 公开 API 不变：`start`、`stop`、`send`、`status`、`describe`、`waitForFirstPoll`。
3. 协议不变：四个端点、`/next` 挂起 25 秒、`remainingMs`、版本闸语义。

## 非目标

- 不改 HTTP 契约、端口、超时数值。
- 不引入 HTTP 框架、状态库或新依赖。
- 不改 `test/bridge/` 现有用例的断言。

## 方案

拆成三个文件加一个门面。

| 文件 | 内容 | 实施后行数 |
|---|---|---|
| `src/bridge/index.ts` | `Bridge` 门面：组装三块，保留公开 API | 322 |
| `src/bridge/queue.ts` | 在途表、队列、waiter 唤醒、摘取与 settle | 122 |
| `src/bridge/ownership.ts` | 绑端口、client 模式、抢端口、owner 探活 | 195 |
| `src/bridge/http.ts` | 四个端点、origin 与本地进程校验、版本闸、错误信封归一化 | 256 |

依赖方向：`index → {queue, ownership, http}`，`http → queue`，三者都只依赖 `protocol/`。无环。边表按目录分级，`bridge` 依赖 `protocol` 一条已涵盖新增文件，无需改动。

### 迁移步骤

每步之后 `pnpm test` 必须全绿。

1. 抽 `queue.ts`。搬 `queue`、`waiters`、`pending`、`waitForCommand`、`expire`、`timeoutReason`、`fail`、`retire`。`Bridge` 持有一个实例。
2. 抽 `ownership.ts`。搬 `start`、`bindAsClientOrFail`、`takePort`、`askOwnerStatus`、`promoteToServer`。HTTP 服务由门面以回调传入。
3. 抽 `http.ts`。搬 `handle`、`handleCommand`、`handleNext`、`handleResult`、`sendJson`、两个 origin 校验、`readBody`。入参是 queue 与版本状态。
4. 边表不用改：它按目录分级，`bridge` 依赖 `protocol` 一条已经涵盖新增的三个文件。改 [ARCHITECTURE](../ARCHITECTURE.md) §1 的模块表。
5. 收工 QA 四条。

### 验收

- `pnpm test` 全绿，用例数量不变。
- `test/bridge/multi-session.test.ts`、`timeout.test.ts` 一行不改。
- `pnpm lint`、`pnpm check:imports`、`pnpm typecheck` 全绿。
- 公开 API 的签名与返回类型不变。

## 风险

- 抢端口与投递命令会交错。第 2 步之后，「抢到端口再用同一份预算本地重发」必须仍然成立，不能另起一次超时。
- `handleNext` 里「投递前断线就把命令放回队首」依赖 `request.once("close")` 与 waiter 的 `cancel` 成对。这两段必须同进 `queue.ts`，或同留 `http.ts`，不能拆散。
- 现有桥测试都用真端口。拆完不加新的注入点。

## 未决问题

1. 要不要给 `BridgeOptions` 加 `fetch` 注入，让 `sendViaOwner` 的失败分支可测？倾向不加：当前没有第二个用途。
2. `versionMismatch` 归 `http.ts` 还是门面？倾向门面：它决定 `sendLocal` 是否拒发，不只是 HTTP 状态。
