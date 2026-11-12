import { rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { writeConfig } from "../support/env.ts";
import { identityOf } from "../support/paths.ts";
import { writeProfile } from "../support/profiles.ts";
import { firstText, flushDelivery, parseStarted, pendingAskLine } from "../support/result.ts";
import { lostChild, runTask, sendTask } from "../support/run.ts";
import { settleTurn } from "../support/turn.ts";
import "../support/hooks.ts";

it("re-reads the profile on restart", async () => {
  writeProfile("explore.md", "---\nmodel: old/model\n---\n\nOld body.\n");
  const { fake, started, tool } = await lostChild({ profile: "explore" });

  writeProfile("explore.md", "---\nmodel: new/model\n---\n\nNew body.\n");

  const result = await sendTask(tool, "explore-1", "continue the task");

  expect(result.isError).toBe(false);
  expect(fake.agents[1]?.agentArgs).toEqual(expect.arrayContaining(["--model", "new/model"]));
  expect(await readFile(identityOf(started.sessionFile), "utf8")).toBe("New body.");

  expect(fake.agents).toHaveLength(2);
});

it("delivers only the result after the restart", async () => {
  writeProfile("explore.md", "---\nmodel: old/model\n---\n\nExplore body.\n");
  const { fake, sent, started, tool } = await lostChild({ profile: "explore" });
  const before = sent.length;

  const result = await sendTask(tool, "explore-1", "continue the task");
  expect(result.isError).toBe(false);

  settleTurn(started.sessionFile, { text: "new result" });
  await vi.advanceTimersByTimeAsync(500);
  await flushDelivery(sent, before + 1);

  expect(sent[before]?.message.content).toContain("new result");
  expect(sent[before]?.message.content).not.toContain("old result");
  expect(fake.agents).toHaveLength(2);
});

it("keeps dead runs for send", async () => {
  writeConfig({ maxConcurrent: 1 });
  writeProfile("explore.md", "---\nmodel: old/model\nauto-exit: true\n---\n\nExplore body.\n");
  const { fake, sent, started, tool } = await lostChild({ profile: "explore" });
  const before = sent.length;

  const restarted = await sendTask(tool, "explore-1", "continue the task");

  expect(restarted.isError).toBe(false);
  expect(JSON.parse(firstText(restarted))).toMatchObject({ state: "restarted", name: "explore-1" });
  expect(fake.agents).toHaveLength(2);

  settleTurn(started.sessionFile, { text: "second result" });
  await vi.advanceTimersByTimeAsync(500);
  await flushDelivery(sent, before + 1);

  expect(sent[before]?.message.content).toContain("second result");
  expect(fake.calls).toContain("closePane");

  const next = await runTask(tool, "next task", "explore");

  expect(next.isError).toBe(false);
  expect(parseStarted(next).name).toBe("explore-2");
});

it("sends to a renamed agent by pane id", async () => {
  process.env.HERDR_ENV = "1";
  const { fakeHost } = await import("../support/host.ts");
  const { loadSession } = await import("../support/session.ts");
  const fake = fakeHost();
  const { tool } = loadSession(fake.host);
  const started = parseStarted(await runTask(tool, "inspect the repo"));
  settleTurn(started.sessionFile, { text: "idle" });
  await new Promise((resolve) => setTimeout(resolve, 30));
  fake.setListAgents(async () => [
    {
      name: "renamed-worker",
      paneId: started.paneId,
      sessionFile: `${started.sessionFile}.other`,
      status: "idle",
    },
  ]);

  const reply = await sendTask(tool, "worker-1", "next turn");

  expect(reply.isError).toBe(false);
  expect(firstText(reply)).toBe('{"state":"sent","name":"worker-1"}');
  expect(fake.agents).toHaveLength(1);
});

it("opens a new tab when the pane is gone", async () => {
  writeProfile("explore.md", "---\nmodel: old/model\n---\n\nExplore body.\n");
  const { fake, started, tool } = await lostChild({ profile: "explore" });
  fake.setPaneExists(false);

  const result = await sendTask(tool, "explore-1", "continue the task");

  expect(result.isError).toBe(false);
  expect(result.details).toMatchObject({ state: "restarted", name: "explore-1", paneId: "w1:p2" });
  expect(fake.tabs.at(-1)).toMatchObject({ cwd: process.cwd(), label: "explore-1" });
  expect(fake.agents[1]?.paneId).toBe("w1:p2");
  expect(fake.agents[1]?.sessionFile).toBe(started.sessionFile);
});

it("restarts in the recorded cwd", async () => {
  writeProfile("explore.md", "---\nmodel: old/model\n---\n\nExplore body.\n");
  const { fake, tool } = await lostChild({ profile: "explore", cwd: "sub" });
  fake.setPaneExists(false);

  await sendTask(tool, "explore-1", "continue the task");

  expect(fake.workspaces.at(-1)?.cwd).toBe(join(process.cwd(), "sub"));
});

it("refuses a dirty session", async () => {
  writeProfile("explore.md", "---\nmodel: old/model\n---\n\nExplore body.\n");
  const { fake, started, tool } = await lostChild({ profile: "explore" });
  writeFileSync(started.sessionFile, `${pendingAskLine()}\n`);

  const result = await sendTask(tool, "explore-1", "continue the task");

  expect(result.isError).toBe(true);
  expect(result.details).toMatchObject({ code: "tail_dirty" });
  expect(fake.agents).toHaveLength(1);
});

it("refuses a missing session", async () => {
  writeProfile("explore.md", "---\nmodel: old/model\n---\n\nExplore body.\n");
  const { started, tool } = await lostChild({ profile: "explore" });
  rmSync(started.sessionFile, { force: true });

  const result = await sendTask(tool, "explore-1", "continue the task");

  expect(result.isError).toBe(true);
  expect(result.details).toMatchObject({ code: "session_missing" });
});
