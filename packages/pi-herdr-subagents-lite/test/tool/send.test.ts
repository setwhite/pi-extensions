import { expect, it } from "vitest";
import { fakeHost } from "../support/host.ts";
import { readInbox } from "../support/inbox.ts";
import { writeProfile } from "../support/profiles.ts";
import { eventually, parseStarted } from "../support/result.ts";
import { lostChild, runTask, sendTask } from "../support/run.ts";
import { loadSession } from "../support/session.ts";
import { settleTurn } from "../support/turn.ts";
import "../support/hooks.ts";

it("queues a message for a live child", async () => {
  process.env.HERDR_ENV = "1";
  const fake = fakeHost();
  fake.setAgents(async () => ({ status: "working" }));
  const { tool } = loadSession(fake.host);
  const started = parseStarted(await runTask(tool, "inspect the repo"));

  const result = await sendTask(tool, "worker-1", "Also check the Windows branch.");

  expect(result.isError).toBe(false);
  expect(result.details).toMatchObject({ state: "sent", name: "worker-1" });
  const queued = readInbox(started.sessionFile).filter((text) => text.startsWith("[from parent]"));
  expect(queued).toHaveLength(1);
  expect(queued[0]).toContain("Also check the Windows branch.");
});

it("queues a message for an idle child without rechecking the agent list", async () => {
  process.env.HERDR_ENV = "1";
  const fake = fakeHost();
  const { sent, tool } = loadSession(fake.host);
  const started = parseStarted(await runTask(tool, "inspect the repo"));
  settleTurn(started.sessionFile, { text: "done" });
  await eventually(() => sent.length === 1);
  const callsBefore = fake.calls.filter((call) => call === "listAgents").length;

  const result = await sendTask(tool, "worker-1", "next");

  expect(result.isError).toBe(false);
  expect(fake.calls.filter((call) => call === "listAgents").length).toBe(callsBefore + 1);
});

it("resumes a lost child", async () => {
  writeProfile("explore.md", "---\nmodel: old/model\n---\n\nExplore body.\n");
  const { fake, started, tool } = await lostChild({ profile: "explore" });

  const result = await sendTask(tool, "explore-1", "continue the task");

  expect(result.isError).toBe(false);
  expect(result.details).toMatchObject({ state: "restarted", name: "explore-1" });
  expect(fake.agents).toHaveLength(2);
  expect(fake.agents[1]).toMatchObject({ name: "explore-1", sessionFile: started.sessionFile });
});
