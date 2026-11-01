import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { HerdrHostError } from "../../src/herdr/index.ts";
import { fakeHost } from "../support/host.ts";
import { sessionsRoot } from "../support/profiles.ts";
import { assistantLine, firstText, parseStarted } from "../support/result.ts";
import { runTask } from "../support/run.ts";
import { loadSession, loadTimedSession, loadTool } from "../support/session.ts";
import "../support/hooks.ts";

it("gives up after 100 name retries", async () => {
  process.env.HERDR_ENV = "1";
  const calls: string[] = [];
  let nameTaken = true;
  const { agents, host } = fakeHost({
    events: calls,
    failures: { startAgent: () => (nameTaken ? new HerdrHostError("name_taken", "taken") : undefined) },
  });
  const { sent, tool } = loadSession(host, calls);

  const result = await runTask(tool, "retry task");

  expect(result.isError).toBe(true);
  expect(result.details).toMatchObject({ code: "name_exhausted" });
  expect(agents.map((agent) => agent.name)).toEqual(Array.from({ length: 100 }, (_, index) => `worker-${index + 1}`));
  expect(calls.filter((call) => call === "startAgent")).toHaveLength(100);
  expect(calls.filter((call) => call === "closeTabIfOnlyPane")).toHaveLength(0);
  expect(agents.filter((agent) => existsSync(`${agent.sessionFile}.brief.md`))).toEqual([]);
  expect(agents.filter((agent) => existsSync(`${agent.sessionFile}.identity.md`))).toEqual([]);
  expect(agents.filter((agent) => existsSync(`${agent.sessionFile}.inbox`))).toEqual([]);
  expect(sent).toHaveLength(0);

  nameTaken = false;

  expect((await runTask(tool, "next task")).isError).toBe(false);
});

it("uses distinct child sessions", async () => {
  process.env.HERDR_ENV = "1";
  const { host } = fakeHost();
  const tool = loadTool(host);

  const first = parseStarted(await runTask(tool, "first task"));
  const second = parseStarted(await runTask(tool, "second task"));

  expect(first.name).toBe("worker-1");
  expect(second.name).toBe("worker-2");
  expect(first.sessionFile.startsWith(join(sessionsRoot(), "worker-1-"))).toBe(true);
  expect(second.sessionFile.startsWith(join(sessionsRoot(), "worker-2-"))).toBe(true);
  expect(second.sessionFile).not.toBe(first.sessionFile);
});

it("reports createTab failure", async () => {
  process.env.HERDR_ENV = "1";
  const calls: string[] = [];
  let createTabError: Error | undefined = new HerdrHostError("tab_create_failed", "workspace is gone");
  const { host } = fakeHost({ events: calls, failures: { createTab: () => createTabError } });
  const { sent, tool } = loadSession(host, calls);

  const result = await runTask(tool, "inspect the repo");

  expect(result.isError).toBe(true);
  expect(result.details).toMatchObject({ code: "spawn_failed" });
  expect(firstText(result)).toContain("workspace is gone");
  expect(calls.filter((call) => call === "startAgent")).toHaveLength(0);
  expect(calls.filter((call) => call === "closeTabIfOnlyPane")).toHaveLength(0);
  expect(sent).toHaveLength(0);

  createTabError = undefined;

  const next = await runTask(tool, "next task");
  expect(next.isError).toBe(false);
});

it("reports startAgent failure with pane", async () => {
  process.env.HERDR_ENV = "1";
  const calls: string[] = [];
  let ready = false;
  const { host } = fakeHost({
    events: calls,
    failures: {
      startAgent: () => (ready ? undefined : new HerdrHostError("agent_not_ready", "pi did not become ready")),
    },
  });
  const { sent, tool } = loadSession(host, calls);

  const result = await runTask(tool, "blocked task");

  expect(result.isError).toBe(true);
  expect(result.details).toMatchObject({ code: "spawn_failed" });
  const text = firstText(result);
  expect(text).toContain("w1:p1");
  expect(text).toContain("trust");
  expect(calls.filter((call) => call === "closeTabIfOnlyPane")).toHaveLength(0);
  expect(sent).toHaveLength(0);

  ready = true;

  const next = await runTask(tool, "next task");
  expect(next.isError).toBe(false);
});

it("delivers one done result", async () => {
  const { calls, sent, tool } = loadTimedSession(async () => ({ status: "idle", completionSeq: 1 }));

  const started = parseStarted(await runTask(tool, "say hello"));
  writeFileSync(started.sessionFile, `${assistantLine("hello")}\n`);

  await vi.advanceTimersByTimeAsync(1000);

  expect(sent).toHaveLength(1);
  const message = sent[0]?.message;
  expect(message?.customType).toBe("subagent_result");
  expect(message?.display).toBe(true);
  expect(message?.content.startsWith("[subagent worker-1] done")).toBe(true);
  expect(message?.content).toContain("hello");
  expect(sent[0]?.options).toEqual({ triggerTurn: true });
  expect(calls.filter((call) => call === "closeTabIfOnlyPane")).toHaveLength(0);

  await vi.advanceTimersByTimeAsync(5000);

  expect(sent).toHaveLength(1);
  expect(calls.filter((call) => call === "closeTabIfOnlyPane")).toHaveLength(0);
});

it("keeps polling while the agent is not registered yet", async () => {
  let registered = false;
  const { sent, tool } = loadTimedSession(async () => (registered ? { status: "idle", completionSeq: 1 } : null));

  const started = parseStarted(await runTask(tool, "boot slowly"));

  await vi.advanceTimersByTimeAsync(5000);
  expect(sent).toHaveLength(0);

  registered = true;
  writeFileSync(started.sessionFile, `${assistantLine("ready now")}\n`);
  await vi.advanceTimersByTimeAsync(1000);

  expect(sent).toHaveLength(1);
  expect(sent[0]?.message.content.startsWith("[subagent worker-1] done")).toBe(true);
  expect(sent[0]?.message.content).toContain("ready now");
});
