import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { agentDir } from "./env.ts";

export function childSessionFile(): string {
  return join(agentDir, "child.jsonl");
}

const BRIEF = /^@.*\.brief\.md$/;

export function readInbox(sessionFile: string): string[] {
  const dir = `${sessionFile}.inbox`;
  let names: string[];
  try {
    names = readdirSync(dir).filter((name) => name.endsWith(".md"));
  } catch {
    return [];
  }
  return names.sort().map((name) => readFileSync(join(dir, name), "utf8"));
}

// brief 是 run 的任务，不是 send 排队的消息。
export function pendingInbox(sessionFile: string): number {
  return readInbox(sessionFile).filter((text) => !BRIEF.test(text.trim())).length;
}

export function drainInbox(sessionFile: string): string[] {
  const dir = `${sessionFile}.inbox`;
  const texts = readInbox(sessionFile);
  for (const name of readdirSyncSafe(dir)) {
    rmSync(join(dir, name), { force: true });
  }
  return texts;
}

function readdirSyncSafe(dir: string): string[] {
  try {
    return readdirSync(dir).filter((name) => name.endsWith(".md"));
  } catch {
    return [];
  }
}

export function writeInbox(sessionFile: string, files: Array<[name: string, text: string]>) {
  const dir = `${sessionFile}.inbox`;
  mkdirSync(dir, { recursive: true });
  for (const [name, text] of files) {
    writeFileSync(join(dir, name), text);
  }
}
