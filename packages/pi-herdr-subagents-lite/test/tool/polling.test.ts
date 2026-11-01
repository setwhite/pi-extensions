import { writeFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import type { AgentSnapshot } from "../../src/herdr/index.ts";
import type { RunStarted } from "../../src/run/index.ts";
import { writeExitReceipt } from "../../src/session-file/index.ts";
import { writeConfig } from "../support/env.ts";
import { fakeHost } from "../support/host.ts";
import { writeProfile } from "../support/profiles.ts";
import { assistantLine, parseStarted } from "../support/result.ts";
import { runTask } from "../support/run.ts";
import { loadSession, loadTimedSession } from "../support/session.ts";
import "../support/hooks.ts";

it("does not overlap polls", async () => {
  let resolvePoll: (snapshot: AgentSnapshot) => void = () => {};
  let polls = 0;
  const { tool } = loadTimedSession(async () => {
    polls += 1;
    if (polls === 1) {
      return new Promise<AgentSnapshot>((resolve) => {
        resolvePoll = resolve;
      });
    }
    return { status: "working", completionSeq: 0 };
  });

  await runTask(tool, "slow task");

  await vi.advanceTimersByTimeAsync(3000);
  expect(polls).toBe(1);

  resolvePoll({ status: "working", completionSeq: 0 });
  await vi.advanceTimersByTimeAsync(1000);
  expect(polls).toBe(2);
});

it("keeps polling other runs when delivery fails", async () => {
  writeConfig({ maxConcurrent: 2 });
  vi.useFakeTimers();
  process.env.HERDR_ENV = "1";
  const fake = fakeHost();
  const { notifications, sent, setSendFailures, tool } = loadSession(fake.host);
  fake.setAgents(async () => ({ status: "idle", completionSeq: 1 }));
  const first = parseStarted(await runTask(tool, "first task"));
  const second = parseStarted(await runTask(tool, "second task"));
  writeFileSync(first.sessionFile, `${assistantLine("first answer")}\n`);
  writeFileSync(second.sessionFile, `${assistantLine("second answer")}\n`);
  setSendFailures(1);

  await vi.advanceTimersByTimeAsync(1000);
  expect(sent).toHaveLength(1);
  expect(sent[0]?.message.content).toContain("second answer");
  expect(notifications.some((notification) => notification.message.includes("not delivered"))).toBe(true);

  await vi.advanceTimersByTimeAsync(1000);
  expect(sent).toHaveLength(1);
});

it("releases the slot after done", async () => {
  writeConfig({ maxConcurrent: 4 });
  writeProfile("worker.md", "---\nauto-exit: true\n---\n\nWorker body.\n");
  const { sent, tool } = loadTimedSession(async (name) =>
    name === "worker-1" ? { status: "idle", completionSeq: 1 } : { status: "working", completionSeq: 0 },
  );

  const started: RunStarted[] = [];
  for (let index = 1; index <= 4; index++) {
    started.push(parseStarted(await runTask(tool, `task ${index}`)));
  }
  const first = started[0];
  if (!first) {
    throw new Error("expected a first run");
  }
  writeFileSync(first.sessionFile, `${assistantLine("hello")}\n`);

  await vi.advanceTimersByTimeAsync(1000);
  expect(sent).toHaveLength(1);

  const fifth = await runTask(tool, "after release");

  expect(fifth.isError).toBe(false);
  expect(parseStarted(fifth).name).toBe("worker-5");
});

it("delivers a done result from the exit receipt", async () => {
  const { sent, tool } = loadTimedSession(async () => null);

  const started = parseStarted(await runTask(tool, "finished task"));
  writeFileSync(started.sessionFile, `${assistantLine("final answer")}\n`);
  writeExitReceipt(started.sessionFile, "quit");

  await vi.advanceTimersByTimeAsync(1000);

  expect(sent).toHaveLength(1);
  expect(sent[0]?.message.content.startsWith("[subagent worker-1] done")).toBe(true);
  expect(sent[0]?.message.content).toContain("final answer");
});

it("reports a killed child once the absence outlasts the lease", async () => {
  let snapshot: AgentSnapshot | null = { status: "working", completionSeq: 0 };
  const { sent, tool } = loadTimedSession(async () => snapshot);

  await runTask(tool, "vanish later");

  await vi.advanceTimersByTimeAsync(1000);
  expect(sent).toHaveLength(0);

  snapshot = null;
  await vi.advanceTimersByTimeAsync(5000);
  expect(sent).toHaveLength(0);

  await vi.advanceTimersByTimeAsync(10_000);
  expect(sent[0]?.message.content).toContain("the pane exited without a result");
});

it("reports a quitted run when the receipt has no final answer", async () => {
  const { sent, tool } = loadTimedSession(async () => null);

  const started = parseStarted(await runTask(tool, "vanished task"));
  writeExitReceipt(started.sessionFile, "quit");

  await vi.advanceTimersByTimeAsync(1000);

  expect(sent).toHaveLength(1);
  expect(sent[0]?.message.content).toContain("the child exited without a result");
});

it("reports pane exited without a receipt", async () => {
  const { calls, fake, sent, tool } = loadTimedSession(async () => null);
  fake.setPaneExists(false);

  const started = parseStarted(await runTask(tool, "vanished task"));

  await vi.advanceTimersByTimeAsync(1000);

  const content = sent[0]?.message.content ?? "";
  expect(sent).toHaveLength(1);
  expect(content).toContain("the pane exited without a result");
  expect(content).toContain(`Session file: ${started.sessionFile}`);
  expect(calls.filter((call) => call === "closeTabIfOnlyPane")).toHaveLength(0);

  await vi.advanceTimersByTimeAsync(5000);
  expect(sent).toHaveLength(1);

  const next = await runTask(tool, "next task");
  expect(next.isError).toBe(false);
});
