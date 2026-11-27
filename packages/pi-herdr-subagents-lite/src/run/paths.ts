import { mkdir } from "node:fs/promises";
import { join } from "node:path";

export function runDirOf(runsDir: string, id: string): string {
  return join(runsDir, id);
}

export function sessionFileOf(runDir: string): string {
  return join(runDir, "session.jsonl");
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

export async function ensureRunDir(runDir: string): Promise<void> {
  await mkdir(runDir, { recursive: true });
}
