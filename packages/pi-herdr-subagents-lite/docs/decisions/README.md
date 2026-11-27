# 决策

当前设计（v2）：子代理是 herdr tab 里的常驻 pi 子进程，深度上限 1。模型面是 `subagent`（`spawn` / `steer` / `inspect` / `stop`），子侧只有 `request_input`。完成靠 `result.json`，投递靠原生 `followUp`。当前代码见 [ARCHITECTURE](../ARCHITECTURE.md)，契约见 [v2 契约](../specs/0002_v2_architecture_spec.md)。

v1 时代的决策（profile、inbox、turn 事件、轮询存活检测）保留为历史记录，其中被 v2 移除的部分见 [契约 §8](../specs/0002_v2_architecture_spec.md) 与 DEC-0071。

一条决策一份文件。文件名前缀就是编号（`0036` → [0036-result-pipeline.md](0036-result-pipeline.md)），正文引用写 `DEC-0036`。对外契约见 [v2 契约](../specs/0002_v2_architecture_spec.md)，已取消的提案见 [CANCELLED.md](CANCELLED.md)。

## 形态

- [0001](0001-own-extension.md) 自研扩展，不 fork 参考项目
- [0002](0002-repo-and-stack.md) 独立 repo 与技术栈
- [0003](0003-subprocess.md) 子代理是独立子进程
- [0006](0006-persistent-session.md) 常驻子进程用 `pi --session`
- [0017](0017-herdr-only.md) all in herdr
- [0018](0018-no-headless.md) 不做 headless 与 RPC
- [0041](0041-package-name.md) 包名与发布方式

## 架构

- [0055](0055-architecture-naming.md) 模块命名与文件拆分

## 布局与启动

- [0022](0022-tab-placement.md) 新 tab 或新 workspace
- [0023](0023-start-then-prompt.md) brief 不进启动参数，等 idle 后经 inbox 投递
- [0047](0047-close-on-done-default-keep.md) 完成默认保留 tab。已由 0063 取代
- [0048](0048-close-children-on.md) 父会话结束按 closeChildrenOn 清理
- [0060](0060-close-pane-not-tab.md) 关闭按 pane，不按 tab。投递判据已由 0062 取代
- [0032](0032-death-detection.md) died 判定。已由 0064 取代
- [0053](0053-session-dir.md) 子 session 进父会话的桶，run 文件进扩展目录的 runs/
- [0068](0068-run-retention.md) run 附属文件按保留期清理
- [0071](0071-completion-by-agent-wait.md) 完成通知用 `agent.wait`，不用 `events.subscribe`
- [0072](0072-pending-questions-file.md) 待答问题落 `questions.json`，`turn_end` 不能盖掉 `needs_input`
- [0056](0056-auto-exit-channel.md) auto-exit 用 pane env 传。已由 0063 取代

## 任务与上下文

- [0009](0009-brief-file.md) 任务简报写文件，用 `@brief` 经 inbox 投递
- [0010](0010-cwd-from-run.md) 子代理 cwd 来自 run 参数
- [0013](0013-fresh-only.md) v1 只支持 fresh
- [0050](0050-skills.md) skills 三态
- [0051](0051-system-prompt.md) system-prompt 三模式

## 结果与恢复

- [0020](0020-result-states.md) 回投状态与聚合
- [0030](0030-async-only.md) 只做异步交付
- [0031](0031-crash-recovery.md) 死亡不自动重启，send 可重启
- [0036](0036-result-pipeline.md) 结果投递路径
- [0052](0052-completion-snapshot.md) 完成检测用 agent list 快照。已由 0062 / 0064 取代

## 终止与存活

- [0062](0062-turn-event-contract.md) 终止用回合事件，父代理不推断
- [0063](0063-close-pane-owner.md) 关 pane 只由父代理做
- [0064](0064-liveness-by-agent-absence.md) 存活按 agent 缺席三次判定
- [0066](0066-starting-phase.md) 启动中也是状态，不参与存活对账
- [0065](0065-settle-state-machine.md) 结算收敛成一个状态机

## 身份与展示

- [0021](0021-identity.md) 身份 = herdr live agent name
- [0044](0044-display.md) 展示只用 name 与任务首行
- [0033](0033-no-metadata.md) 不依赖 pane.report_metadata
- [0038](0038-no-reclaim.md) 父进程重启后不认领旧子代理

## 状态与交互

- [0024](0024-state-source.md) 状态只读 herdr
- [0025](0025-native-alerts.md) 提醒走原生
- [0040](0040-bridge.md) bridge 上报 blocked。已由 0070 取代
- [0049](0049-merge-bridge.md) bridge 并入主扩展。已由 0070 取代
- [0070](0070-delete-bridge.md) 删掉 bridge，blocked 交给会阻塞的交互扩展

## 投递与写冲突

- [0026](0026-file-inbox.md) send 走文件 inbox
- [0027](0027-no-write-limits.md) 不做运行时写限制

## 工具与配置

- [0011](0011-config-surface.md) 可配置项
- [0067](0067-herdr-call-bounds.md) herdr 调用有超时，abort 贯穿
- [0069](0069-profile-unknown-fields.md) profile 未知字段报错
- [0034](0034-single-tool.md) 模型面只有一个工具，两个 action
- [0037](0037-config-layers.md) 只有全局配置
- [0042](0042-profile-layers.md) profile 全局 + 项目
- [0045](0045-tool-name.md) 默认工具名 subagent，重名不处理
- [0046](0046-no-role-detection.md) 角色只看 inbox 目录
- [0057](0057-example-profile.md) 自带 worker 示例 profile
- [0058](0058-profile-name-key.md) profile 名 = frontmatter name
- [0059](0059-skill-lookup.md) skills 白名单按名字查 pi 的发现集
- [0061](0061-no-session-path.md) 模型面不带 session 路径与 pane id
