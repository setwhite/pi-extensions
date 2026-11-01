import { writeFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { writeConfig } from "../support/env.ts";
import { writeInbox } from "../support/inbox.ts";
import { assistantLine, parseStarted } from "../support/result.ts";
import { runTask } from "../support/run.ts";
import { loadAutoExitChild, loadTimedSession } from "../support/session.ts";
import "../support/hooks.ts";

it("coalesces results in one window", async () => {
  writeConfig({ aggregateWindowMs: 500 });
  const { sent, tool } = loadTimedSession(async () => ({ status: "idle", completionSeq: 1 }));
  const first = parseStarted(await runTask(tool, "first task"));
  const second = parseStarted(await runTask(tool, "second task"));
  writeFileSync(first.sessionFile, `${assistantLine("first answer")}\n`);
  writeFileSync(second.sessionFile, `${assistantLine("second answer")}\n`);

  await vi.advanceTimersByTimeAsync(1000);
  expect(sent).toHaveLength(0);

  await vi.advanceTimersByTimeAsync(500);
  expect(sent).toHaveLength(1);
  const content = sent[0]?.message.content ?? "";
  expect(content).toContain("[subagent worker-1] done");
  expect(content).toContain("[subagent worker-2] done");
});

it("reports a deferred delivery failure", async () => {
  writeConfig({ aggregateWindowMs: 500 });
  const { notifications, sent, setSendFailures, tool } = loadTimedSession(async () => ({
    status: "idle",
    completionSeq: 1,
  }));
  const started = parseStarted(await runTask(tool, "first task"));
  writeFileSync(started.sessionFile, `${assistantLine("first answer")}\n`);
  setSendFailures(1);

  await vi.advanceTimersByTimeAsync(1000);
  expect(sent).toHaveLength(0);

  await vi.advanceTimersByTimeAsync(500);
  expect(sent).toHaveLength(0);
  expect(notifications.some((notification) => notification.message.includes("not delivered"))).toBe(true);
});

it("sends separately when aggregation is off", async () => {
  writeConfig({ aggregateWindowMs: 0 });
  const { sent, tool } = loadTimedSession(async () => ({ status: "idle", completionSeq: 1 }));
  const first = parseStarted(await runTask(tool, "first task"));
  const second = parseStarted(await runTask(tool, "second task"));
  writeFileSync(first.sessionFile, `${assistantLine("first answer")}\n`);
  writeFileSync(second.sessionFile, `${assistantLine("second answer")}\n`);

  await vi.advanceTimersByTimeAsync(1000);

  expect(sent).toHaveLength(2);
});

it("reports an immediate delivery failure when aggregation is off", async () => {
  writeConfig({ aggregateWindowMs: 0 });
  const { notifications, sent, setSendFailures, tool } = loadTimedSession(async () => ({
    status: "idle",
    completionSeq: 1,
  }));
  const started = parseStarted(await runTask(tool, "first task"));
  writeFileSync(started.sessionFile, `${assistantLine("first answer")}\n`);
  setSendFailures(1);

  await vi.advanceTimersByTimeAsync(1000);

  expect(sent).toHaveLength(0);
  expect(notifications.some((notification) => notification.message.includes("not delivered"))).toBe(true);
});

it("flushes at the window boundary", async () => {
  writeConfig({ aggregateWindowMs: 300 });
  const { sent, tool } = loadTimedSession(async () => ({ status: "idle", completionSeq: 1 }));
  const started = parseStarted(await runTask(tool, "first task"));
  writeFileSync(started.sessionFile, `${assistantLine("first answer")}\n`);

  await vi.advanceTimersByTimeAsync(1000);
  expect(sent).toHaveLength(0);

  await vi.advanceTimersByTimeAsync(299);
  expect(sent).toHaveLength(0);

  await vi.advanceTimersByTimeAsync(1);
  expect(sent).toHaveLength(1);
});

it("keeps a tab with several panes", async () => {
  writeConfig({ closeChildrenOn: ["quit"] });
  const { notifications, shutdownSession, tool } = loadTimedSession(
    async () => ({ status: "working", completionSeq: 0 }),
    () => "kept",
  );

  await runTask(tool, "long task");
  await shutdownSession("quit");

  expect(notifications).toEqual([
    { message: 'child "worker-1" kept running: its tab has more than one pane', type: "warning" },
  ]);
});

it("shuts down after settle when auto-exit is on", async () => {
  const settled = loadAutoExitChild();
  settled.fake.settle();
  expect(settled.fake.shutdowns).toBe(1);

  const queued = loadAutoExitChild();
  writeInbox(queued.sessionFile, [["a.md", "more work"]]);
  queued.fake.settle();
  expect(queued.fake.shutdowns).toBe(0);

  const prompted = loadAutoExitChild();
  prompted.fake.promptStart();
  prompted.fake.settle();
  expect(prompted.fake.shutdowns).toBe(0);
});

it("does not shut down without the env", async () => {
  const child = loadAutoExitChild({ env: null });

  child.fake.settle();

  expect(child.fake.shutdowns).toBe(0);
});
