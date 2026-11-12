import { basename, dirname, join, relative } from "node:path";
import { dataDir } from "../config/index.ts";
import { agentDir } from "../profile/index.ts";

export function samePath(left: string, right: string): boolean {
  return relative(left, right) === "";
}

export function runsDir(): string {
  return join(dataDir(agentDir()), "runs");
}

// run 的附属文件共用一个前缀：brief、identity、inbox、turn 事件、结果 artifact。
export function runBaseOf(sessionFile: string): string {
  return join(runsDir(), basename(sessionFile, ".jsonl"));
}

// 子会话进父会话所在的桶，与父会话同为 sessions 下的目录。
export function childSessionsDir(parentSessionFile: string | undefined): string {
  const sessionsDir = parentSessionFile === undefined ? join(agentDir(), "sessions") : dirname(parentSessionFile);
  return join(sessionsDir, "runs");
}
