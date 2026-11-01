import { writeFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { fakeHost } from "../support/host.ts";
import { assistantLine, parseStarted } from "../support/result.ts";
import { runTask } from "../support/run.ts";
import { loadSession } from "../support/session.ts";
import "../support/hooks.ts";

it("matches an agent that moved pane by session file", async () => {
  vi.useFakeTimers();
  process.env.HERDR_ENV = "1";
  const fake = fakeHost();
  const { sent, tool } = loadSession(fake.host);
  const started = parseStarted(await runTask(tool, "inspect the repo"));
  fake.setListAgents(async () => [
    { name: "renamed-elsewhere", paneId: "w2:p9", sessionFile: started.sessionFile, status: "idle", completionSeq: 1 },
  ]);
  writeFileSync(started.sessionFile, `${assistantLine("moved answer")}\n`);

  await vi.advanceTimersByTimeAsync(1000);

  expect(sent).toHaveLength(1);
  expect(sent[0]?.message.content).toContain("moved answer");
});

it("matches by name when herdr reports no session path", async () => {
  vi.useFakeTimers();
  process.env.HERDR_ENV = "1";
  const fake = fakeHost();
  const { sent, tool } = loadSession(fake.host);
  const started = parseStarted(await runTask(tool, "inspect the repo"));
  fake.setListAgents(async () => [
    { name: started.name, paneId: "w2:p9", sessionFile: null, status: "idle", completionSeq: 1 },
  ]);
  writeFileSync(started.sessionFile, `${assistantLine("named answer")}\n`);

  await vi.advanceTimersByTimeAsync(1000);

  expect(sent).toHaveLength(1);
  expect(sent[0]?.message.content).toContain("named answer");
});

it("matches a renamed agent by pane id", async () => {
  vi.useFakeTimers();
  process.env.HERDR_ENV = "1";
  const fake = fakeHost();
  const { sent, tool } = loadSession(fake.host);
  const started = parseStarted(await runTask(tool, "inspect the repo"));
  let seq = 1;
  fake.setListAgents(async () => [
    {
      name: `renamed-worker-${seq}`,
      paneId: started.paneId,
      sessionFile: `${started.sessionFile}.other`,
      status: "idle",
      completionSeq: seq,
    },
  ]);

  writeFileSync(started.sessionFile, `${assistantLine("first answer")}\n`);
  await vi.advanceTimersByTimeAsync(1000);

  expect(sent).toHaveLength(1);
  expect(sent[0]?.message.content).toContain("first answer");

  seq = 2;
  writeFileSync(started.sessionFile, `${assistantLine("second answer")}\n`);
  await vi.advanceTimersByTimeAsync(1000);

  expect(sent).toHaveLength(2);
  expect(sent[1]?.message.content).toContain("second answer");
});
