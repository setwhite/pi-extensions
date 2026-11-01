import { rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { agentDir, writeConfig } from "../support/env.ts";
import { fakeHost } from "../support/host.ts";
import { writeProfile } from "../support/profiles.ts";
import { assistantLine, firstText, parseStarted } from "../support/result.ts";
import { exitedChild, runTask, sendTask } from "../support/run.ts";
import { loadSession } from "../support/session.ts";
import "../support/hooks.ts";

it("re-reads the profile on restart", async () => {
  writeProfile("explore.md", "---\nmodel: old/model\n---\n\nOld body.\n");
  const { fake, setAfterResume, started, tool } = await exitedChild({ profile: "explore" });

  writeProfile("explore.md", "---\nmodel: new/model\n---\n\nNew body.\n");

  const result = await sendTask(tool, "explore-1", "continue the task");

  expect(result.isError).toBe(false);
  expect(fake.agents[1]?.agentArgs).toEqual(expect.arrayContaining(["--model", "new/model"]));
  expect(await readFile(`${started.sessionFile}.identity.md`, "utf8")).toBe("New body.");

  rmSync(join(agentDir, "pi-herdr-subagents-lite", "profiles", "explore.md"), { force: true });
  setAfterResume(null);

  const missing = await sendTask(tool, "explore-1", "again");

  expect(missing.isError).toBe(true);
  expect(missing.details).toMatchObject({ code: "unknown_profile" });
  expect(fake.agents).toHaveLength(2);
});

it("delivers only the result after the restart", async () => {
  writeProfile("explore.md", "---\nmodel: old/model\n---\n\nExplore body.\n");
  const { sent, setAfterResume, started, tool } = await exitedChild({
    profile: "explore",
    baseline: { status: "idle", completionSeq: 3 },
  });

  expect(sent).toHaveLength(1);

  const result = await sendTask(tool, "explore-1", "continue the task");

  expect(result.isError).toBe(false);

  await vi.advanceTimersByTimeAsync(1000);
  expect(sent).toHaveLength(1);

  setAfterResume({ status: "idle", completionSeq: 4 });
  writeFileSync(started.sessionFile, `${assistantLine("new result")}\n`);
  await vi.advanceTimersByTimeAsync(1000);

  expect(sent).toHaveLength(2);
  expect(sent[1]?.message.content).toContain("new result");
  expect(sent[1]?.message.content).not.toContain("old result");

  await vi.advanceTimersByTimeAsync(2000);
  expect(sent).toHaveLength(2);
});

it("keeps finished runs for send", async () => {
  writeConfig({ maxConcurrent: 1 });
  writeProfile("explore.md", "---\nmodel: old/model\nauto-exit: true\n---\n\nExplore body.\n");
  const { fake, sent, setAfterResume, started, tool } = await exitedChild({ profile: "explore" });

  const restarted = await sendTask(tool, "explore-1", "continue the task");

  expect(restarted.isError).toBe(false);
  expect(JSON.parse(firstText(restarted))).toMatchObject({ state: "restarted", name: "explore-1" });
  expect(fake.agents).toHaveLength(2);

  setAfterResume({ status: "idle", completionSeq: 2 });
  writeFileSync(started.sessionFile, `${assistantLine("second result")}\n`);
  await vi.advanceTimersByTimeAsync(1000);

  expect(sent).toHaveLength(2);

  const next = await runTask(tool, "next task", "explore");

  expect(next.isError).toBe(false);
  expect(parseStarted(next).name).toBe("explore-2");
});

it("sends to a renamed agent by pane id", async () => {
  vi.useFakeTimers();
  process.env.HERDR_ENV = "1";
  const fake = fakeHost();
  const { sent, tool } = loadSession(fake.host);
  const started = parseStarted(await runTask(tool, "inspect the repo"));
  fake.setListAgents(async () => [
    {
      name: "renamed-worker",
      paneId: started.paneId,
      sessionFile: `${started.sessionFile}.other`,
      status: "idle",
      completionSeq: 1,
    },
  ]);

  const reply = await sendTask(tool, "worker-1", "next turn");

  expect(reply.isError).toBe(false);
  expect(firstText(reply)).toBe('{"state":"sent","name":"worker-1"}');
  expect(fake.agents).toHaveLength(1);
  expect(sent).toHaveLength(0);
});

it("re-reads auto-exit when restarting", async () => {
  writeProfile("explore.md", "---\nmodel: old/model\n---\n\nExplore body.\n");
  const { fake, sent, setAfterResume, started, tool } = await exitedChild({ profile: "explore" });
  writeProfile("explore.md", "---\nmodel: old/model\nauto-exit: true\n---\n\nExplore body.\n");

  const result = await sendTask(tool, "explore-1", "continue the task");

  expect(JSON.parse(firstText(result))).toEqual({ state: "restarted", name: "explore-1", paneId: "w1:p2" });
  expect(started.paneId).toBe("w1:p1");
  expect(fake.tabs.at(-1)?.env).toEqual({ PI_SUBAGENT_AUTO_EXIT: "1" });
  expect(fake.agents[1]?.paneId).toBe("w1:p2");

  setAfterResume({ status: "idle", completionSeq: 2 });
  writeFileSync(started.sessionFile, `${assistantLine("new result")}\n`);
  await vi.advanceTimersByTimeAsync(1000);

  expect(sent).toHaveLength(2);
  expect(sent[1]?.message.content).toContain("new result");
  expect(fake.calls.filter((call) => call === "closeTabIfOnlyPane")).toHaveLength(2);
});
