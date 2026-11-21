import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { pruneRuns } from "../../src/run/prune.ts";

const DAY = 86_400_000;
const NOW = 1_800_000_000_000;
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function runsDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "pi-herdr-prune-"));
  dirs.push(dir);
  return dir;
}

function age(path: string, days: number): void {
  const time = new Date(NOW - days * DAY);
  utimesSync(path, time, time);
}

function runFile(dir: string, name: string, ageDays: number): string {
  const path = join(dir, name);
  writeFileSync(path, "x");
  age(path, ageDays);
  return path;
}

function turnsDir(dir: string, name: string, ageDays: number): string {
  const path = join(dir, name);
  mkdirSync(path, { recursive: true });
  runFile(path, "000001.json", ageDays);
  age(path, ageDays);
  return path;
}

it("deletes run files older than the retention and keeps the rest", () => {
  const dir = runsDir();
  const old = runFile(dir, "worker-1.brief.md", 40);
  const fresh = runFile(dir, "worker-2.brief.md", 1);
  const oldTurns = turnsDir(dir, "worker-3.turns", 40);

  pruneRuns(dir, 30 * DAY, NOW, []);

  expect([existsSync(old), existsSync(fresh), existsSync(oldTurns)]).toEqual([false, true, false]);
});

it("keeps every file of a run that is still known to this session", () => {
  const dir = runsDir();
  const brief = runFile(dir, "worker-1.brief.md", 40);
  const turns = turnsDir(dir, "worker-1.turns", 40);

  pruneRuns(dir, 30 * DAY, NOW, ["worker-1"]);

  expect([existsSync(brief), existsSync(turns)]).toEqual([true, true]);
});

it("deletes nothing when the retention is zero", () => {
  const dir = runsDir();
  const old = runFile(dir, "worker-1.brief.md", 400);

  pruneRuns(dir, 0, NOW, []);

  expect(existsSync(old)).toBe(true);
});

it("survives a runs directory that does not exist", () => {
  expect(() => pruneRuns(join(tmpdir(), "pi-herdr-prune-missing"), DAY, NOW, [])).not.toThrow();
});
