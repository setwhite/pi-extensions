import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { fakeHost } from "../support/host.ts";
import { pendingInbox, readInbox } from "../support/inbox.ts";
import { writeProfile } from "../support/profiles.ts";
import { firstText, parseStarted, pendingAskLine } from "../support/result.ts";
import { exitedChild, runTask, sendTask } from "../support/run.ts";
import { loadSession } from "../support/session.ts";
import "../support/hooks.ts";

it("queues a message for a live child", async () => {
  process.env.HERDR_ENV = "1";
  writeProfile("explore.md", "---\ndescription: Explore\n---\n\nExplore body.\n");
  const fake = fakeHost();
  fake.setAgents(async () => ({ status: "working", completionSeq: 0 }));
  const { tool } = loadSession(fake.host);
  const started = parseStarted(await runTask(tool, "inspect the repo", "explore"));

  const result = await sendTask(tool, "explore-1", "Also check the Windows branch.");

  expect(result.isError).toBe(false);
  expect(firstText(result)).toBe('{"state":"sent","name":"explore-1"}');
  const queued = readInbox(started.sessionFile).filter((text) => text.startsWith("[from parent]"));
  expect(queued).toHaveLength(1);
  expect(queued[0]).toContain("Also check the Windows branch.");
});

it("resumes the exited child in its pane", async () => {
  writeProfile("explore.md", "---\nmodel: old/model\n---\n\nExplore body.\n");
  const { fake, started, tool } = await exitedChild({ profile: "explore" });

  const result = await sendTask(tool, "explore-1", "continue the task");

  expect(result.isError).toBe(false);
  expect(firstText(result)).toBe(JSON.stringify({ state: "restarted", name: "explore-1", paneId: started.paneId }));
  expect(fake.agents).toHaveLength(2);
  expect(fake.inboxAtStart).toEqual([0, 0]);
  expect(fake.agents[1]).toMatchObject({
    name: "explore-1",
    paneId: started.paneId,
    sessionFile: started.sessionFile,
  });
  expect(pendingInbox(started.sessionFile)).toBe(1);
});

it("opens a new tab when the pane is gone", async () => {
  writeProfile("explore.md", "---\nmodel: old/model\n---\n\nExplore body.\n");
  const { fake, started, tool } = await exitedChild({ profile: "explore" });
  fake.setPaneExists(false);

  const result = await sendTask(tool, "explore-1", "continue the task");

  expect(result.isError).toBe(false);
  expect(JSON.parse(firstText(result))).toEqual({
    state: "restarted",
    name: "explore-1",
    paneId: "w1:p2",
  });
  expect(fake.tabs.at(-1)).toEqual({ cwd: process.cwd(), label: "explore-1", env: { PI_SUBAGENT_AUTO_EXIT: "0" } });
  expect(fake.agents[1]?.paneId).toBe("w1:p2");
  expect(fake.agents[1]?.sessionFile).toBe(started.sessionFile);
});

it("restarts in the recorded cwd", async () => {
  writeProfile("explore.md", "---\nmodel: old/model\n---\n\nExplore body.\n");
  const { fake, tool } = await exitedChild({ profile: "explore", cwd: "sub" });
  fake.setPaneExists(false);

  await sendTask(tool, "explore-1", "continue the task");

  expect(fake.workspaces.at(-1)?.cwd).toBe(join(process.cwd(), "sub"));
});

it("refuses a dirty session", async () => {
  writeProfile("explore.md", "---\nmodel: old/model\n---\n\nExplore body.\n");
  const { fake, started, tool } = await exitedChild({ profile: "explore" });
  writeFileSync(started.sessionFile, `${pendingAskLine()}\n`);

  const result = await sendTask(tool, "explore-1", "continue the task");

  expect(result.isError).toBe(true);
  expect(result.details).toMatchObject({ code: "tail_dirty" });
  expect(fake.agents).toHaveLength(1);
  expect(pendingInbox(started.sessionFile)).toBe(0);
});

it("refuses a missing session", async () => {
  writeProfile("explore.md", "---\nmodel: old/model\n---\n\nExplore body.\n");
  const { fake, started, tool } = await exitedChild({ profile: "explore" });
  rmSync(started.sessionFile, { force: true });

  const result = await sendTask(tool, "explore-1", "continue the task");

  expect(result.isError).toBe(true);
  expect(result.details).toMatchObject({ code: "session_missing" });
  expect(fake.agents).toHaveLength(1);
  expect(pendingInbox(started.sessionFile)).toBe(0);
});

it("refuses to restart an unreadable session", async () => {
  writeProfile("explore.md", "---\nmodel: old/model\n---\n\nExplore body.\n");
  const { fake, started, tool } = await exitedChild({ profile: "explore" });
  rmSync(started.sessionFile, { force: true });
  mkdirSync(started.sessionFile);

  const result = await sendTask(tool, "explore-1", "continue the task");

  expect(result.isError).toBe(true);
  expect(result.details).toMatchObject({ code: "session_unreadable" });
  expect(fake.agents).toHaveLength(1);
  expect(pendingInbox(started.sessionFile)).toBe(0);
});
