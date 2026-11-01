import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { expect, it } from "vitest";
import { fakeHost } from "../support/host.ts";
import { drainInbox } from "../support/inbox.ts";
import { sessionsRoot, writeProfile } from "../support/profiles.ts";
import { startRun } from "../support/run.ts";
import "../support/hooks.ts";

it("keeps brief and identity next to the session", async () => {
  process.env.HERDR_ENV = "1";
  writeProfile("worker.md", "---\ndescription: worker\n---\n\nWorker body.\n");
  const { agent, started } = await startRun(fakeHost());

  const identity = `${started.sessionFile}.identity.md`;
  expect(dirname(started.sessionFile)).toBe(sessionsRoot());
  expect(agent.agentArgs).toEqual(expect.arrayContaining(["--append-system-prompt", identity]));
  expect(await readFile(`${started.sessionFile}.brief.md`, "utf8")).toContain("inspect the repo");
  expect(drainInbox(started.sessionFile)).toEqual([`@${started.sessionFile}.brief.md`]);
  expect(await readFile(identity, "utf8")).toBe("Worker body.");
});

it("starts a run with a global profile", async () => {
  process.env.HERDR_ENV = "1";
  writeProfile("explore.md", "---\ndescription: Explore the repo\n---\n\nExplore body.\n");

  const { started } = await startRun(fakeHost(), { profile: "explore" });

  expect(started).toMatchObject({ state: "running", name: "explore-1", paneId: "w1:p1" });
});

it("uses the cwd parameter", async () => {
  process.env.HERDR_ENV = "1";
  const relative = fakeHost();

  await startRun(relative, { cwd: "sub" });

  expect(relative.workspaces.map((workspace) => workspace.cwd)).toEqual([join(process.cwd(), "sub")]);

  const absolute = fakeHost();
  const target = join(process.cwd(), "other");

  await startRun(absolute, { cwd: target });

  expect(absolute.workspaces.map((workspace) => workspace.cwd)).toEqual([target]);

  const tilde = fakeHost();

  await startRun(tilde, { cwd: "~/infra" });

  expect(tilde.workspaces.map((workspace) => workspace.cwd)).toEqual([join(homedir(), "infra")]);

  const plain = fakeHost();

  await startRun(plain);

  expect(plain.tabs).toEqual([{ cwd: process.cwd(), label: "worker-1", env: { PI_SUBAGENT_AUTO_EXIT: "0" } }]);
});

it("creates a workspace when the cwd differs", async () => {
  process.env.HERDR_ENV = "1";
  const fake = fakeHost();

  const { started } = await startRun(fake, { cwd: "sub" });

  expect(fake.calls.filter((call) => call === "createWorkspace")).toHaveLength(1);
  expect(fake.calls).not.toContain("createTab");
  expect(fake.workspaces).toEqual([
    { cwd: join(process.cwd(), "sub"), label: "worker-1", env: { PI_SUBAGENT_AUTO_EXIT: "0" } },
  ]);
  expect(fake.renamedTabs).toEqual([{ tabId: "w2:t1", label: "worker-1" }]);
  expect(started.paneId).toBe("w2:p1");
});

it("uses the current workspace for the parent cwd", async () => {
  process.env.HERDR_ENV = "1";
  const fake = fakeHost();

  await startRun(fake);

  expect(fake.calls).not.toContain("createWorkspace");
  expect(fake.tabs).toHaveLength(1);
});

it("passes model and thinking", async () => {
  process.env.HERDR_ENV = "1";
  writeProfile("worker.md", "---\nmodel: opencode-go/x\nthinking: high\n---\n\nWorker body.\n");

  const { agent } = await startRun(fakeHost());

  expect(agent.agentArgs).toEqual(expect.arrayContaining(["--model", "opencode-go/x", "--thinking", "high"]));
});

it("writes the identity file", async () => {
  process.env.HERDR_ENV = "1";
  writeProfile("worker.md", "---\ndescription: append\n---\n\nExplore body.\n");

  const appended = await startRun(fakeHost());
  const identity = `${appended.started.sessionFile}.identity.md`;
  expect(await readFile(identity, "utf8")).toBe("Explore body.");
  expect(appended.agent.agentArgs).toEqual(expect.arrayContaining(["--append-system-prompt", identity]));
  expect(appended.agent.agentArgs).not.toContain("--system-prompt");

  writeProfile("worker.md", "---\nsystem-prompt: replace\n---\n\nReplace body.\n");
  const replaced = await startRun(fakeHost());
  const secondIdentity = `${replaced.started.sessionFile}.identity.md`;
  expect(await readFile(secondIdentity, "utf8")).toBe("Replace body.");
  expect(replaced.agent.agentArgs).toEqual(expect.arrayContaining(["--system-prompt", secondIdentity]));
  expect(replaced.agent.agentArgs).not.toContain("--append-system-prompt");

  writeProfile("worker.md", "---\nsystem-prompt: task\n---\n\nTask body.\n");
  const tasked = await startRun(fakeHost());
  expect(existsSync(`${tasked.started.sessionFile}.identity.md`)).toBe(false);
  expect(tasked.agent.agentArgs).not.toContain("--append-system-prompt");
  expect(tasked.agent.agentArgs).not.toContain("--system-prompt");
  expect((await readFile(`${tasked.started.sessionFile}.brief.md`, "utf8")).startsWith("Task body.")).toBe(true);
});
