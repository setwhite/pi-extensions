// 真实 herdr + 真实 pi：每次运行自建 named session 与隔离 agent 目录，永不碰 default session 与 ~/.pi。
// 模型调用会花钱；缺 herdr、pi 或 auth.json 时整组跳过。
export { HerdrE2e } from "./herdr-e2e.ts";
export type { AgentInfo, PaneInfo, TabInfo } from "./herdr-session.ts";
export type { Prereq } from "./prereq.ts";
export { HERDR_BIN, PI_BIN, prereqs } from "./prereq.ts";
export { killProcess, sleep, waitFor } from "./process.ts";
export type { RestartedRun, SentMessage, StartedRun } from "./session.ts";
export { entries, errors, hasToolCall, messages, results, textOf } from "./session.ts";
