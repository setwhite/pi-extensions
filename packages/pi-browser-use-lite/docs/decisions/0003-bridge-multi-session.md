# 0003 本地桥保留多会话共享

## 问题

本地桥（`127.0.0.1:17318`）要不要支持多个 Pi 进程共用一条 Chrome 连接。

## 选项

1. 保留 server/client 双模式：先绑端口的进程当 server，其他进程经 `POST /command` 转发。owner 消失时 client 抢占端口升为 server。
2. 去掉：只留 `/next` 与 `/result`。碰到 `EADDRINUSE` 报错。
3. 折中：碰到 `EADDRINUSE` 不报错，第二个会话不注册工具。

## 选了

1。

## 理由

`pi-herdr-subagents-lite` 用 `execFile` 起独立的 `pi` 进程（`src/run/spawn-args.ts` 造 CLI 参数）。每个进程加载本扩展都要绑 17318。没有共享，子代理全部用不了 chrome 工具。

成本实测低于预期：client 路径约 130 行，占 `ChromeProfileBridge` 类的 30%。测试成本 1 个用例 —— 107 个用例里只有 `test-suite/unit/chrome-command.test.mjs:149` 用 `mode: "client"`。交接记录说「约一半单测在测这条路径」，实测不成立。
