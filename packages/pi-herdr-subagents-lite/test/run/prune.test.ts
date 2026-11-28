import { mkdirSync, mkdtempSync, utimesSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { pruneAgedDirs } from "../../src/run/index.ts";

const DAY = 86_400_000;

function runsDirWith(ages: Array<{ name: string; ageMs: number }>): { dir: string; now: number } {
  const dir = mkdtempSync(join(tmpdir(), "pi-herdr-prune-"));
  const now = Date.now();
  for (const entry of ages) {
    const path = join(dir, entry.name);
    mkdirSync(path, { recursive: true });
    const at = (now - entry.ageMs) / 1000;
    utimesSync(path, at, at);
  }
  return { dir, now };
}

describe("pruneAgedDirs", () => {
  it("removes only runs past the retention window", async () => {
    const { dir, now } = runsDirWith([
      { name: "old", ageMs: 10 * DAY },
      { name: "fresh", ageMs: DAY },
    ]);

    await expect(pruneAgedDirs(dir, 5 * DAY, now)).resolves.toBe(1);
    await expect(readdir(dir)).resolves.toEqual(["fresh"]);
  });

  it("keeps everything when retention is disabled", async () => {
    const { dir, now } = runsDirWith([{ name: "old", ageMs: 100 * DAY }]);

    await expect(pruneAgedDirs(dir, 0, now)).resolves.toBe(0);
    await expect(readdir(dir)).resolves.toEqual(["old"]);
  });

  it("ignores a missing runs directory", async () => {
    await expect(pruneAgedDirs(join(tmpdir(), "pi-herdr-absent-dir"), DAY, Date.now())).resolves.toBe(0);
  });
});
