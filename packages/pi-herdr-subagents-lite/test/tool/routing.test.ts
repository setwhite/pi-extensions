import { rmSync, writeFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { configFile, writeConfig } from "../support/env.ts";
import { fakeHost } from "../support/host.ts";
import { pendingInbox } from "../support/inbox.ts";
import { writeProfile } from "../support/profiles.ts";
import { assistantLine, firstText, parseStarted } from "../support/result.ts";
import { runTask, runTasks, sendTask } from "../support/run.ts";
import { loadSession, loadTimedSession, loadTool } from "../support/session.ts";
import "../support/hooks.ts";

it("re-arms a finished child that is still alive", async () => {
  vi.useFakeTimers();
  process.env.HERDR_ENV = "1";
  writeProfile("explore.md", "---\nmodel: old/model\n---\n\nExplore body.\n");
  const fake = fakeHost({ closeTab: () => "kept" });
  fake.setAgents(async () => ({ status: "idle", completionSeq: 1 }));
  const { tool } = loadSession(fake.host);
  const started = parseStarted(await runTask(tool, "inspect the repo", "explore"));
  writeFileSync(started.sessionFile, `${assistantLine("old result")}\n`);
  await vi.advanceTimersByTimeAsync(1000);

  const result = await sendTask(tool, "explore-1", "continue the task");

  expect(result.isError).toBe(false);
  expect(firstText(result)).toBe('{"state":"sent","name":"explore-1"}');
  expect(fake.agents).toHaveLength(1);
  expect(pendingInbox(started.sessionFile)).toBe(1);
});

it("rejects unknown agent", async () => {
  process.env.HERDR_ENV = "1";
  writeProfile("explore.md", "---\ndescription: Explore\n---\n\nExplore body.\n");
  const { tool } = loadSession(fakeHost().host);
  const started = parseStarted(await runTask(tool, "inspect the repo", "explore"));

  const result = await sendTask(tool, "ghost", "hello");

  expect(result.isError).toBe(true);
  const text = firstText(result);
  expect(text.startsWith("unknown_agent:")).toBe(true);
  expect(text).toContain("explore-1");
  expect(pendingInbox(started.sessionFile)).toBe(0);
});

it("lists profiles on unknown profile", async () => {
  process.env.HERDR_ENV = "1";
  writeProfile("explore.md", "---\nname: Inspector\ndescription: Explore the repo\n---\n\nExplore body.\n");
  const { calls, host } = fakeHost();
  const tool = loadTool(host);

  const result = await runTask(tool, "inspect the repo", "nope");

  expect(result.isError).toBe(true);
  expect(result.details).toMatchObject({ code: "unknown_profile" });
  expect(firstText(result)).toContain("Inspector — Explore the repo");
  expect(calls).toEqual([]);
});

it("runs a profile by its frontmatter name", async () => {
  process.env.HERDR_ENV = "1";
  writeProfile("explore.md", "---\nname: Inspector\ndescription: Explore the repo\n---\n\nExplore body.\n");
  const tool = loadTool(fakeHost().host);

  const started = parseStarted(await runTask(tool, "inspect the repo", "Inspector"));

  expect(started.name).toBe("inspector-1");
});

it("reports invalid profile", async () => {
  process.env.HERDR_ENV = "1";
  writeProfile("explore.md", "---\nthinking: sometimes\n---\n\nExplore body.\n");
  const { calls, host } = fakeHost();
  const tool = loadTool(host);

  const result = await runTask(tool, "inspect the repo", "explore");

  expect(result.isError).toBe(true);
  expect(result.details).toMatchObject({ code: "profile_invalid" });
  const text = firstText(result);
  expect(text).toContain("explore.md");
  expect(text).toContain("thinking");
  expect(calls).toEqual([]);
});

it("uses configured max concurrent", async () => {
  writeConfig({ maxConcurrent: 2 });
  const limited = loadTimedSession(async () => null);

  await runTask(limited.tool, "task 1");
  const second = parseStarted(await runTask(limited.tool, "task 2"));

  expect(second.name).toBe("worker-2");

  const rejected = await runTask(limited.tool, "task 3");

  expect(rejected.isError).toBe(true);
  expect(rejected.details).toMatchObject({ code: "max_concurrent" });
  expect(firstText(rejected)).toContain("worker-2");

  rmSync(configFile(), { force: true });

  const defaults = loadTimedSession(async () => null);
  await runTasks(defaults.tool, 3);
});

it("rejects the seventeenth active worker by default", async () => {
  const { calls, tool } = loadTimedSession(async () => null);

  await runTasks(tool, 16);

  const result = await runTask(tool, "task 17");

  expect(result.isError).toBe(true);
  expect(result.details).toMatchObject({ code: "max_concurrent" });
  const text = firstText(result);
  expect(text.startsWith("max_concurrent: ")).toBe(true);
  expect(text).toContain("worker-16");
  expect(calls.filter((call) => call === "createTab")).toHaveLength(16);
});
