import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { artifactOf, receiptOf } from "../support/paths.ts";
import { assistantLine, flushDelivery, longResult, parseStarted } from "../support/result.ts";
import { runTask, sendTask } from "../support/run.ts";
import { loadTimedSession } from "../support/session.ts";
import "../support/hooks.ts";

it("reports poll_failed when the exit receipt cannot be read", async () => {
  const { sent, tool } = loadTimedSession(async () => null);

  const started = parseStarted(await runTask(tool, "vanished task"));
  mkdirSync(receiptOf(started.sessionFile));

  await vi.advanceTimersByTimeAsync(3000);

  expect(sent).toHaveLength(1);
  expect(sent[0]?.message.content).toContain("status could not be read");
});

it("writes an artifact for long results", async () => {
  const { sent, tool } = loadTimedSession(async () => ({ status: "idle", completionSeq: 1 }));

  const started = parseStarted(await runTask(tool, "write a long report"));
  const { head, full } = longResult();
  writeFileSync(started.sessionFile, `${assistantLine(full)}\n`);

  await vi.advanceTimersByTimeAsync(1000);
  await flushDelivery(sent);

  const artifact = artifactOf(started.sessionFile, 1);
  expect(existsSync(artifact)).toBe(true);
  expect(readFileSync(artifact, "utf8")).toBe(full);
  const content = sent[0]?.message.content ?? "";
  expect(content.startsWith("[subagent worker-1] done")).toBe(true);
  expect(content).toContain(head);
  expect(content).not.toContain("TAIL_MARKER");
  expect(content).toContain(`Full result: ${artifact}`);

  await vi.advanceTimersByTimeAsync(5000);
  expect(sent).toHaveLength(1);
});

it("writes an artifact for a long exited result", async () => {
  const { fake, sent, tool } = loadTimedSession(async () => null);
  fake.setPaneExists(false);

  const started = parseStarted(await runTask(tool, "write a long report"));
  const { full } = longResult();
  writeFileSync(started.sessionFile, `${assistantLine(full)}\n`);

  await vi.advanceTimersByTimeAsync(1000);
  await flushDelivery(sent);

  const artifact = artifactOf(started.sessionFile, 1);
  expect(existsSync(artifact)).toBe(true);
  expect(readFileSync(artifact, "utf8")).toBe(full);
  expect(sent[0]?.message.content).toContain(`Full result: ${artifact}`);
});

it("keeps the message when the artifact write fails", async () => {
  const { sent, tool } = loadTimedSession(async () => ({ status: "idle", completionSeq: 1 }));

  const started = parseStarted(await runTask(tool, "write a long report"));
  const { head, full } = longResult();
  writeFileSync(started.sessionFile, `${assistantLine(full)}\n`);
  mkdirSync(artifactOf(started.sessionFile, 1));

  await vi.advanceTimersByTimeAsync(1000);
  await flushDelivery(sent);

  const content = sent[0]?.message.content ?? "";
  expect(content.startsWith("[subagent worker-1] done")).toBe(true);
  expect(content).toContain(head);
  expect(content).not.toContain("TAIL_MARKER");
  expect(content).toContain("artifact write failed");
  expect(existsSync(`${artifactOf(started.sessionFile, 1)}.tmp`)).toBe(false);
});

it("keeps artifacts when the completion seq resets", async () => {
  const { fake, sent, tool } = loadTimedSession(async () => ({ status: "idle", completionSeq: 2 }));
  const started = parseStarted(await runTask(tool, "write a long report"));
  const first = `${"a".repeat(16384)}FIRST_TAIL`;
  writeFileSync(started.sessionFile, `${assistantLine(first)}\n`);

  await vi.advanceTimersByTimeAsync(1000);
  await flushDelivery(sent);
  expect(readFileSync(artifactOf(started.sessionFile, 1), "utf8")).toBe(first);

  fake.setAgents(async () => null);
  await vi.advanceTimersByTimeAsync(1000);

  fake.setAgents(async () => ({ status: "idle", completionSeq: 1 }));
  const revived = await sendTask(tool, started.name, "continue");
  expect(revived.isError).toBe(false);

  fake.setAgents(async () => null);
  fake.setPaneExists(false);
  const second = `${"b".repeat(16384)}SECOND_TAIL`;
  writeFileSync(started.sessionFile, `${assistantLine(second)}\n`);
  await vi.advanceTimersByTimeAsync(1000);
  await flushDelivery(sent, 2);

  expect(sent).toHaveLength(2);
  expect(readFileSync(artifactOf(started.sessionFile, 1), "utf8")).toBe(first);
  expect(readFileSync(artifactOf(started.sessionFile, 2), "utf8")).toBe(second);
});

it("does not write an artifact for short results", async () => {
  const { sent, tool } = loadTimedSession(async () => ({ status: "idle", completionSeq: 1 }));

  const started = parseStarted(await runTask(tool, "say hello"));
  writeFileSync(started.sessionFile, `${assistantLine("short answer")}\n`);

  await vi.advanceTimersByTimeAsync(1000);

  const content = sent[0]?.message.content ?? "";
  expect(sent).toHaveLength(1);
  expect(existsSync(artifactOf(started.sessionFile, 1))).toBe(false);
  expect(content).toContain("short answer");
  expect(content).not.toContain("Full result:");
});
