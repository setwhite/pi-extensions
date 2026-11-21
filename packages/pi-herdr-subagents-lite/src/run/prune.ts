import { readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

// 按修改时间清理 run 附属文件。maxAgeMs <= 0 表示不清理；keep 是本次会话在跑的 run 基名。
export function pruneRuns(dir: string, maxAgeMs: number, now: number, keep: readonly string[]): void {
  if (maxAgeMs <= 0) {
    return;
  }
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  const cutoff = now - maxAgeMs;
  for (const name of entries) {
    if (keep.some((base) => name.startsWith(base))) {
      continue;
    }
    try {
      const path = join(dir, name);
      if (statSync(path).mtimeMs < cutoff) {
        rmSync(path, { recursive: true, force: true });
      }
    } catch {
      // 清理失败不影响主流程。
    }
  }
}
