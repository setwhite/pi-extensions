import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach } from "vitest";

const tempDirs = new Set<string>();

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs.clear();
});

export function tempFile(): string {
  const dir = mkdtempSync(join(tmpdir(), "pi-herdr-session-"));
  tempDirs.add(dir);
  return join(dir, "session.jsonl");
}

export function message(role: string, content: unknown[]): string {
  return JSON.stringify({ type: "message", message: { role, content } });
}
