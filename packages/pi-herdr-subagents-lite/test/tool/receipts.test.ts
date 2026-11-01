import { writeFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import type { AgentSnapshot } from "../../src/herdr/index.ts";
import { writeExitReceipt } from "../../src/session-file/index.ts";
import { assistantLine, parseStarted, pendingAskLine } from "../support/result.ts";
import { runTask } from "../support/run.ts";
import { loadTimedSession } from "../support/session.ts";
import "../support/hooks.ts";

it("does not repeat a delivered run", async () => {
  let snapshot: AgentSnapshot | null = { status: "idle", completionSeq: 1 };
  const { sent, tool } = loadTimedSession(async () => snapshot);

  const started = parseStarted(await runTask(tool, "say hello"));
  writeFileSync(started.sessionFile, `${assistantLine("hello")}\n`);

  await vi.advanceTimersByTimeAsync(1000);
  expect(sent).toHaveLength(1);

  snapshot = null;
  writeExitReceipt(started.sessionFile, "quit");
  await vi.advanceTimersByTimeAsync(1000);

  expect(sent).toHaveLength(1);
});

it("reports three consecutive poll failures", async () => {
  const { calls, sent, tool } = loadTimedSession(async () => {
    throw new Error("herdr answered with garbage");
  });

  await runTask(tool, "flaky task");

  await vi.advanceTimersByTimeAsync(2000);
  expect(sent).toHaveLength(0);

  await vi.advanceTimersByTimeAsync(1000);
  expect(sent).toHaveLength(1);
  expect(sent[0]?.message.content).toContain("status could not be read");
  expect(calls.filter((call) => call === "closeTabIfOnlyPane")).toHaveLength(0);

  await vi.advanceTimersByTimeAsync(1000);
  expect(sent).toHaveLength(1);
});

it("resets poll failure count on success", async () => {
  let polls = 0;
  const { calls, sent, tool } = loadTimedSession(async () => {
    polls += 1;
    if (polls <= 2) {
      throw new Error("temporary herdr error");
    }
    return { status: "idle", completionSeq: 1 };
  });

  const started = parseStarted(await runTask(tool, "eventual success"));
  writeFileSync(started.sessionFile, `${assistantLine("finished")}\n`);

  await vi.advanceTimersByTimeAsync(3000);

  const content = sent[0]?.message.content ?? "";
  expect(sent).toHaveLength(1);
  expect(content.startsWith("[subagent worker-1] done")).toBe(true);
  expect(content).not.toContain("unknown");
  expect(calls.filter((call) => call === "closeTabIfOnlyPane")).toHaveLength(0);
});

it("waits while the worker is blocked in a tool call", async () => {
  const { calls, sent, tool } = loadTimedSession(async () => ({ status: "done", completionSeq: 1 }));

  const started = parseStarted(await runTask(tool, "ask the human"));
  writeFileSync(started.sessionFile, `${pendingAskLine()}\n`);

  await vi.advanceTimersByTimeAsync(5000);
  expect(sent).toHaveLength(0);
  expect(calls.filter((call) => call === "closeTabIfOnlyPane")).toHaveLength(0);

  writeFileSync(started.sessionFile, `${assistantLine("answered")}\n`);
  await vi.advanceTimersByTimeAsync(1000);

  const content = sent[0]?.message.content ?? "";
  expect(sent).toHaveLength(1);
  expect(content.startsWith("[subagent worker-1] done")).toBe(true);
  expect(content).toContain("answered");
  expect(calls.filter((call) => call === "closeTabIfOnlyPane")).toHaveLength(0);
});

it("reports unreadable result as unknown", async () => {
  const { calls, sent, tool } = loadTimedSession(async () => ({ status: "idle", completionSeq: 1 }));

  const started = parseStarted(await runTask(tool, "no output"));
  writeFileSync(
    started.sessionFile,
    `${JSON.stringify({ type: "message", message: { role: "assistant", content: [{ type: "thinking", thinking: "..." }] } })}\n`,
  );

  await vi.advanceTimersByTimeAsync(1000);
  expect(sent).toHaveLength(0);

  await vi.advanceTimersByTimeAsync(400);

  const content = sent[0]?.message.content ?? "";
  expect(sent).toHaveLength(1);
  expect(content).toContain("no result was read");
  expect(content).toContain(`Session file: ${started.sessionFile}`);
  expect(calls.filter((call) => call === "closeTabIfOnlyPane")).toHaveLength(0);

  const next = await runTask(tool, "next task");
  expect(next.isError).toBe(false);
});

it("reports no_result when the session file is missing", async () => {
  const { sent, tool } = loadTimedSession(async () => ({ status: "idle", completionSeq: 1 }));

  await runTask(tool, "no output");

  await vi.advanceTimersByTimeAsync(1000);
  expect(sent).toHaveLength(0);

  await vi.advanceTimersByTimeAsync(400);

  expect(sent).toHaveLength(1);
  expect(sent[0]?.message.content).toContain("no result was read");

  const next = await runTask(tool, "next task");
  expect(next.isError).toBe(false);
});
