import { writeFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { writeConfig } from "../support/env.ts";
import { assistantLine, parseStarted } from "../support/result.ts";
import { runTask, sendTask } from "../support/run.ts";
import { loadTimedSession } from "../support/session.ts";
import "../support/hooks.ts";

const IDLE_MS = 8000;
const ACTIVITY_MS = 30_000;

function gaps(stamps: number[]): number[] {
  return stamps.slice(1).map((stamp, index) => stamp - (stamps[index] ?? 0));
}

async function settledRun(idlePollIntervalMs = IDLE_MS) {
  writeConfig({ idlePollIntervalMs });
  const stamps: number[] = [];
  const session = loadTimedSession(async () => {
    stamps.push(Date.now());
    return { status: "done", completionSeq: 1 };
  });
  const started = parseStarted(await runTask(session.tool, "slow task"));
  writeFileSync(started.sessionFile, `${assistantLine("done")}\n`);
  await vi.advanceTimersByTimeAsync(ACTIVITY_MS + 1000);
  return { ...session, stamps, started };
}

it("backs off to idlePollIntervalMs when every live run is idle", async () => {
  const { stamps } = await settledRun();

  stamps.length = 0;
  await vi.advanceTimersByTimeAsync(3 * IDLE_MS);

  expect(stamps.length).toBeGreaterThanOrEqual(2);
  expect(gaps(stamps).every((gap) => gap >= IDLE_MS)).toBe(true);
});

it("honours a configured idlePollIntervalMs", async () => {
  const { stamps } = await settledRun(1500);

  stamps.length = 0;
  await vi.advanceTimersByTimeAsync(4500);

  expect(gaps(stamps).every((gap) => gap >= 1500)).toBe(true);
  expect(gaps(stamps).some((gap) => gap < IDLE_MS)).toBe(true);
});

it("returns to the fast lane when a message is sent to an idle run", async () => {
  const { stamps, tool, started } = await settledRun();

  stamps.length = 0;
  await sendTask(tool, started.name, "keep going");
  const afterSend = stamps.length;
  await vi.advanceTimersByTimeAsync(1000);

  expect(stamps.length - afterSend).toBeGreaterThanOrEqual(1);
});
