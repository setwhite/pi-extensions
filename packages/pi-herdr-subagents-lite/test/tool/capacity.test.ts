import { writeFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { writeConfig } from "../support/env.ts";
import { fakeHost } from "../support/host.ts";
import { pendingInbox } from "../support/inbox.ts";
import { fakePi } from "../support/pi.ts";
import { writeProfile } from "../support/profiles.ts";
import { firstText, parseStarted } from "../support/result.ts";
import { exitedChild, runTask, sendTask } from "../support/run.ts";
import { loadSession, registerExtension } from "../support/session.ts";
import "../support/hooks.ts";

it("rejects re-arming a settled child at max concurrency", async () => {
  writeConfig({ maxConcurrent: 1 });
  vi.useFakeTimers();
  process.env.HERDR_ENV = "1";
  const fake = fakeHost();
  fake.setAgents(async (name) =>
    name === "worker-1" ? { status: "idle", completionSeq: 1 } : { status: "working", completionSeq: 0 },
  );
  const { tool } = loadSession(fake.host);
  const first = parseStarted(await runTask(tool, "first task"));
  writeFileSync(
    first.sessionFile,
    `${JSON.stringify({
      type: "message",
      message: { role: "assistant", content: [{ type: "thinking", thinking: "..." }] },
    })}\n`,
  );
  await vi.advanceTimersByTimeAsync(1400);
  const second = parseStarted(await runTask(tool, "second task"));
  expect(second.name).toBe("worker-2");

  const result = await sendTask(tool, "worker-1", "next turn");

  expect(result.isError).toBe(true);
  expect(result.details).toMatchObject({ code: "max_concurrent" });
  expect(firstText(result)).toContain("worker-2");
  expect(pendingInbox(first.sessionFile)).toBe(0);
});

it("rejects restarting an exited child at max concurrency", async () => {
  writeConfig({ maxConcurrent: 1 });
  writeProfile("explore.md", "---\nmodel: old/model\nauto-exit: true\n---\n\nExplore body.\n");
  const { fake, started, tool } = await exitedChild({ profile: "explore" });
  const second = parseStarted(await runTask(tool, "next task", "explore"));
  expect(second.name).toBe("explore-2");

  const result = await sendTask(tool, "explore-1", "continue the task");

  expect(result.isError).toBe(true);
  expect(result.details).toMatchObject({ code: "max_concurrent" });
  expect(fake.agents).toHaveLength(2);
  expect(pendingInbox(started.sessionFile)).toBe(0);
});

it("starts a fresh service for each session", async () => {
  process.env.HERDR_ENV = "1";
  const { host } = fakeHost();
  const { startSession, tool } = loadSession(host);

  expect(parseStarted(await runTask(tool, "first task")).name).toBe("worker-1");
  startSession();
  expect(parseStarted(await runTask(tool, "next session")).name).toBe("worker-1");
});

it("registers the tool at session start", () => {
  process.env.HERDR_ENV = "1";
  const { pi, startSession, tools } = fakePi();

  registerExtension(pi, fakeHost().host);

  expect(tools).toHaveLength(0);

  startSession();

  expect(tools.map((tool) => tool.name)).toEqual(["subagent"]);
});

it("honors tool name", () => {
  process.env.HERDR_ENV = "1";
  writeConfig({ toolName: "helper" });
  const registered = fakePi();

  registerExtension(registered.pi, fakeHost().host);
  registered.startSession();

  expect(registered.tools.map((tool) => tool.name)).toEqual(["helper"]);

  for (const invalid of ["Helper", "1x", "a".repeat(33)]) {
    writeConfig({ toolName: invalid });
    const failed = fakePi();

    expect(() => registerExtension(failed.pi, fakeHost().host)).toThrow(/toolName/);
    expect(failed.tools).toHaveLength(0);
  }
});

it("skips registration when disabled", () => {
  process.env.HERDR_ENV = "1";
  writeConfig({ enabled: false });
  const { pi, startSession, tools } = fakePi();

  registerExtension(pi, fakeHost().host);
  startSession();

  expect(tools).toHaveLength(0);
});

it("emits without the subagent tool", () => {
  writeConfig({ enabled: false });
  const { emitted, pi, promptStart, startSession } = fakePi();

  registerExtension(pi, fakeHost().host);
  startSession();
  promptStart({ kind: "custom", title: "Pick one" });

  expect(emitted).toEqual([{ channel: "herdr:blocked", data: { active: true, label: "Pick one" } }]);
});
