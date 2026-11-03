import { runBaseOf } from "../../src/run/index.ts";

// 测试按 session 文件定位 run 的附属文件，与 src 用同一个前缀。
export function baseOf(sessionFile: string): string {
  return runBaseOf(sessionFile);
}

export function inboxOf(sessionFile: string): string {
  return `${baseOf(sessionFile)}.inbox`;
}

export function briefOf(sessionFile: string): string {
  return `${baseOf(sessionFile)}.brief.md`;
}

export function identityOf(sessionFile: string): string {
  return `${baseOf(sessionFile)}.identity.md`;
}

export function receiptOf(sessionFile: string): string {
  return `${baseOf(sessionFile)}.exit`;
}

export function artifactOf(sessionFile: string, seq: number): string {
  return `${baseOf(sessionFile)}.result-${seq}.md`;
}
