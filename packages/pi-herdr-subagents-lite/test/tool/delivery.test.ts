import { writeFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import type { AgentSnapshot } from "../../src/herdr/index.ts";
import { writeConfig } from "../support/env.ts";
import { writeProfile } from "../support/profiles.ts";
import { assistantLine, firstText, parseStarted } from "../support/result.ts";
import { runTask, sendTask } from "../support/run.ts";
import { loadTimedSession } from "../support/session.ts";
import "../support/hooks.ts";

it("keeps a finished run live and delivers the next turn", async () => {
  let snapshot: AgentSnapshot = { status: "idle", completionSeq: 1 };
  const { calls, sent, tool } = loadTimedSession(async () => snapshot);

  const started = parseStarted(await runTask(tool, "say hello"));
  writeFileSync(started.sessionFile, `${assistantLine("first")}\n`);

  await vi.advanceTimersByTimeAsync(1000);

  expect(sent).toHaveLength(1);
  expect(sent[0]?.message.content).toContain("first");
  expect(calls.filter((call) => call === "closeTabIfOnlyPane")).toHaveLength(0);

  const reply = await sendTask(tool, "worker-1", "next turn");

  expect(reply.isError).toBe(false);
  expect(firstText(reply)).toBe('{"state":"sent","name":"worker-1"}');

  snapshot = { status: "idle", completionSeq: 2 };
  writeFileSync(started.sessionFile, `${assistantLine("second")}\n`);
  await vi.advanceTimersByTimeAsync(1000);

  expect(sent).toHaveLength(2);
  expect(sent[1]?.message.content).toContain("second");
  expect(calls.filter((call) => call === "closeTabIfOnlyPane")).toHaveLength(0);
});

it("closes the tab when auto-exit is true", async () => {
  writeConfig({ maxConcurrent: 1 });
  writeProfile("worker.md", "---\nauto-exit: true\n---\n\nWorker body.\n");
  const { calls, sent, tool } = loadTimedSession(async () => ({ status: "idle", completionSeq: 1 }));

  const started = parseStarted(await runTask(tool, "say hello"));
  writeFileSync(started.sessionFile, `${assistantLine("hello")}\n`);

  await vi.advanceTimersByTimeAsync(1000);

  expect(sent).toHaveLength(1);
  expect(calls.filter((call) => call === "closeTabIfOnlyPane")).toHaveLength(1);
  expect(calls.indexOf("sendMessage")).toBeLessThan(calls.indexOf("closeTabIfOnlyPane"));

  const next = await runTask(tool, "next task");

  expect(next.isError).toBe(false);
  expect(parseStarted(next).name).toBe("worker-2");
});

it("does not deliver the same text twice", async () => {
  let snapshot: AgentSnapshot = { status: "idle", completionSeq: 1 };
  const { sent, tool } = loadTimedSession(async () => snapshot);

  const started = parseStarted(await runTask(tool, "say hello"));
  writeFileSync(started.sessionFile, `${assistantLine("same")}\n`);

  await vi.advanceTimersByTimeAsync(1000);
  expect(sent).toHaveLength(1);

  snapshot = { status: "idle", completionSeq: 2 };
  await vi.advanceTimersByTimeAsync(1000);

  expect(sent).toHaveLength(1);
});

it("stays quiet when a finished run has no new text", async () => {
  let snapshot: AgentSnapshot = { status: "idle", completionSeq: 1 };
  const { sent, tool } = loadTimedSession(async () => snapshot);

  const started = parseStarted(await runTask(tool, "say hello"));
  writeFileSync(started.sessionFile, `${assistantLine("first")}\n`);

  await vi.advanceTimersByTimeAsync(1000);
  expect(sent).toHaveLength(1);

  snapshot = { status: "idle", completionSeq: 2 };
  const silent = JSON.stringify({
    type: "message",
    message: { role: "assistant", content: [{ type: "thinking", thinking: "..." }] },
  });
  writeFileSync(started.sessionFile, `${silent}\n`);
  await vi.advanceTimersByTimeAsync(1000);
  await vi.advanceTimersByTimeAsync(1000);

  expect(sent).toHaveLength(1);
});

it("ignores completion seq zero", async () => {
  let snapshot: AgentSnapshot = { status: "idle", completionSeq: 0 };
  const { calls, sent, tool } = loadTimedSession(async () => snapshot);

  const started = parseStarted(await runTask(tool, "status first"));
  writeFileSync(started.sessionFile, `${assistantLine("hello")}\n`);

  await vi.advanceTimersByTimeAsync(1000);

  expect(calls.filter((call) => call === "listAgents")).toHaveLength(1);
  expect(sent).toHaveLength(0);
  expect(calls.filter((call) => call === "closeTabIfOnlyPane")).toHaveLength(0);

  snapshot = { status: "idle", completionSeq: 1 };
  await vi.advanceTimersByTimeAsync(1000);

  expect(sent).toHaveLength(1);
  expect(sent[0]?.message.content.startsWith("[subagent worker-1] done")).toBe(true);
});

it("polls all runs with one agent list call", async () => {
  writeConfig({ maxConcurrent: 3 });
  const { calls, tool } = loadTimedSession(async () => ({ status: "working", completionSeq: 0 }));

  for (let index = 1; index <= 3; index++) {
    await runTask(tool, `task ${index}`);
  }

  await vi.advanceTimersByTimeAsync(1000);

  expect(calls.filter((call) => call === "listAgents")).toHaveLength(1);
});
