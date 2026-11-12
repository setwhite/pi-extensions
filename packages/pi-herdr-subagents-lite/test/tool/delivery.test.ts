import { writeFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { writeTurn } from "../../src/turn/index.ts";
import { fakeHost } from "../support/host.ts";
import { baseOf } from "../support/paths.ts";
import { firstText, flushDelivery, parseStarted } from "../support/result.ts";
import { runTask, sendTask } from "../support/run.ts";
import { loadSession, loadTimedSession } from "../support/session.ts";
import { settleTurn } from "../support/turn.ts";
import "../support/hooks.ts";

it("delivers a done turn and keeps the pane for send", async () => {
  process.env.HERDR_ENV = "1";
  const fake = fakeHost();
  const { sent, tool } = loadSession(fake.host);

  const started = parseStarted(await runTask(tool, "say hello"));
  settleTurn(started.sessionFile, { text: "first" });
  await flushDelivery(sent);

  expect(sent[0]?.message.content).toContain("[subagent worker-1] done");
  expect(sent[0]?.message.content).toContain("first");
  expect(fake.calls).not.toContain("closePane");

  const reply = await sendTask(tool, "worker-1", "next turn");

  expect(reply.isError).toBe(false);
  expect(firstText(reply)).toBe('{"state":"sent","name":"worker-1"}');

  settleTurn(started.sessionFile, { text: "second" });
  await flushDelivery(sent, 2);

  expect(sent[1]?.message.content).toContain("second");
});

it("labels an errored turn as failed and keeps it resumable", async () => {
  process.env.HERDR_ENV = "1";
  const fake = fakeHost();
  const { sent, tool } = loadSession(fake.host);

  const started = parseStarted(await runTask(tool, "may fail"));
  settleTurn(started.sessionFile, {
    outcome: "error",
    stopReason: "error",
    errorMessage: "529 overloaded",
    text: "half an answer",
  });
  await flushDelivery(sent);

  const content = sent[0]?.message.content ?? "";
  expect(content).toContain("[subagent worker-1] failed");
  expect(content).toContain("529 overloaded");
  expect(content).toContain("Partial answer (not a completed result)");
  expect(fake.calls).not.toContain("closePane");

  const reply = await sendTask(tool, "worker-1", "try again");
  expect(reply.isError).toBe(false);
});

it("labels an aborted turn as interrupted", async () => {
  process.env.HERDR_ENV = "1";
  const { sent, tool } = loadSession(fakeHost().host);

  const started = parseStarted(await runTask(tool, "interrupted"));
  settleTurn(started.sessionFile, { outcome: "aborted", stopReason: "aborted" });
  await flushDelivery(sent);

  expect(sent[0]?.message.content).toContain("[subagent worker-1] interrupted");
});

it("delivers the same turn number once", async () => {
  process.env.HERDR_ENV = "1";
  const { sent, tool } = loadSession(fakeHost().host);

  const started = parseStarted(await runTask(tool, "repeat"));
  settleTurn(started.sessionFile, { text: "once" });
  await flushDelivery(sent);

  writeTurn(baseOf(started.sessionFile), {
    turn: 1,
    outcome: "done",
    stopReason: "stop",
    text: "again",
    children: 0,
    at: Date.now(),
  });
  await new Promise((resolve) => setTimeout(resolve, 40));

  expect(sent).toHaveLength(1);
});

it("reports lost after three absences and closes the pane", async () => {
  const { calls, sent, tool } = loadTimedSession(async () => null);

  await runTask(tool, "vanish later");
  await vi.advanceTimersByTimeAsync(45_000);
  await flushDelivery(sent);

  expect(sent[0]?.message.content).toContain("[subagent worker-1] lost contact");
  expect(calls).toContain("closePane");
});

it("keeps a quitted run resumable", async () => {
  process.env.HERDR_ENV = "1";
  const { sent, tool } = loadSession(fakeHost().host);

  const started = parseStarted(await runTask(tool, "quit soon"));
  writeFileSync(started.sessionFile, "");
  settleTurn(started.sessionFile, { outcome: "quit", stopReason: "quit" });
  await flushDelivery(sent);

  const reply = await sendTask(tool, "worker-1", "anyone there");

  expect(reply.isError).toBe(false);
  expect(reply.details).toMatchObject({ state: "restarted", name: "worker-1" });
});
