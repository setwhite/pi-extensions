import { mkdir } from "node:fs/promises";
import { join } from "node:path";

export function runDirOf(runsDir: string, id: string): string {
  return join(runsDir, id);
}

/** 会话与产物分家：产物目录会被交给父代理，会话不能住在同一棵树下。 */
export function sessionDirOf(sessionsDir: string, id: string): string {
  return join(sessionsDir, id);
}

export function sessionFileOf(sessionDir: string): string {
  return join(sessionDir, "session.jsonl");
}

export function resultPath(runDir: string): string {
  return join(runDir, "result.json");
}

export function questionsPath(runDir: string): string {
  return join(runDir, "questions.json");
}

export function outputPath(runDir: string): string {
  return join(runDir, "output.md");
}

export function absentPath(runDir: string, id: string): string {
  return join(runDir, `absent-${id}.txt`);
}

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}
