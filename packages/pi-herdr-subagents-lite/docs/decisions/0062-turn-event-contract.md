# 0062 终止用回合事件，父代理不推断

子代理每结束一个回合，在 `<runBase>.turns/` 写一个 JSON 文件。父代理只认这个文件。`outcome` 只有 `done | error | aborted | quit` 四种。

## 契约

| 字段 | 含义 |
|---|---|
| `turn` | 递增回合号，同时是文件名 `000001.json` |
| `outcome` | 这一轮的性质 |
| `stopReason` | pi 报告的原始结束原因 |
| `errorMessage` | 失败原因，可省略 |
| `text` | 这一轮最后的助手文本，可省略 |
| `children` | 子代理自己还活着的子代理数 |
| `at` | 写入时间 |

- 唯一写入者是子进程里的扩展，唯一读取者是父进程里的扩展。
- 写入时机是 `agent_settled`。pi 的重试、压缩、续跑都在这个点之前结束，所以重试中的失败不产生事件。
- 写入用 temp + rename，父代理读不到半截文件。
- 父代理投递成功后删除。先投递再删除，崩溃最多重复投一次，不会静默丢。

## 为什么换

父代理原来有三个真相源：herdr 的 `completion_seq`、子 session 尾部、`<runBase>.exit` 回执。

- 尾部只取 text 块，不看 `stopReason`。重试耗尽的失败轮、中断留下的空消息，都能被当成一轮完成。
- 回执在 `session_shutdown` 写，永不删除。`send` 续跑后 agent 登记短暂缺失，`missing()` 先读回执，直接判死。
- 读不到文本时 3 次 × 200ms 后判 `no_result` 并停止轮询，真答案永久丢失。

根因不是某个分支写错，是「谁算完成」没有契约。

## 分类

`aborted` 标志与 `pendingToolCall` 优先于 `stopReason`。

| `stopReason` | 判定 |
|---|---|
| `stop` 或缺省 | `done` |
| `error` | `error`，带 `errorMessage` |
| `length` | `error`，说明被截断 |
| `aborted` 或 `toolUse` | `aborted` |
| 其他 | `error`，带原始原因 |

## 代价与边界

- 多一个目录与一个计数器文件。换来删掉轮询、尾部解析、回执三条路径。
- 子进程必须加载本扩展。没加载就没有事件，由存活兜底报 `lost`（DEC-0064）。
- 父代理关 pane 会直接杀进程，写不出 `quit`。那时已经不需要。
- 跨会话不续投（DEC-0038）。

## 否决的替代

- 继续读 session 尾部，只加 `stopReason` 判断。仍是推断，还要处理 `/tree`、压缩、续跑。
- 用 `<runBase>.exit` 一个文件。只能表达最后一次退出，无法表达多轮。
- 走 herdr socket 事件。CLI 没有订阅命令，protocol 22 没有 pane 关闭事件，本机 Node 连 `HERDR_SOCKET_PATH` 报 `ENOTSOCK`（DEC-0052）。
- 追加式 JSONL 单文件。要维护读偏移，重启后要么重投要么丢，去重还要另存状态。
