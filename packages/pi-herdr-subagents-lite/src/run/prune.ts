import { readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";

/** 会话启动时清掉过期的 <root>/<id>/ 目录；retentionMs 为 0 表示永不清理。 */
export async function pruneAgedDirs(runsDir: string, retentionMs: number, now: number): Promise<number> {
  if (retentionMs <= 0) {
    return 0;
  }
  const entries = await readdir(runsDir, { withFileTypes: true }).catch(() => []);
  let removed = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const path = join(runsDir, entry.name);
    const info = await stat(path).catch(() => undefined);
    if (info === undefined || now - info.mtimeMs <= retentionMs) {
      continue;
    }
    await rm(path, { recursive: true, force: true }).catch(() => undefined);
    removed += 1;
  }
  return removed;
}
