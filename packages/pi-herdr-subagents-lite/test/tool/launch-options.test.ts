import { join } from "node:path";
import { expect, it } from "vitest";
import { agentDir, projectDir, writeConfig } from "../support/env.ts";
import { fakeHost } from "../support/host.ts";
import { writeProfile, writeSkill } from "../support/profiles.ts";
import { firstText } from "../support/result.ts";
import { runTask, startRun } from "../support/run.ts";
import { loadSession, loadTool } from "../support/session.ts";
import "../support/hooks.ts";

it("maps tools", async () => {
  process.env.HERDR_ENV = "1";
  const cases: Array<[string, string[], boolean]> = [
    ["read,bash", ["--tools", "read,bash"], false],
    ["read,subagent", ["--tools", "read,subagent"], false],
    ["+read,-subagent", ["--tools", "+read,-subagent", "--exclude-tools", "subagent"], true],
    ['""', ["--no-tools"], false],
  ];

  for (const [tools, expected, excluded] of cases) {
    writeProfile("worker.md", `---\ntools: ${tools}\n---\n\nWorker body.\n`);

    const { agent } = await startRun(fakeHost());

    expect(agent.agentArgs).toEqual(expect.arrayContaining(expected));
    expect(agent.agentArgs).not.toContain(expected[0] === "--no-tools" ? "--tools" : "--no-tools");
    if (excluded) {
      expect(agent.agentArgs).toEqual(expect.arrayContaining(["--exclude-tools", "subagent"]));
    } else {
      expect(agent.agentArgs).not.toContain("--exclude-tools");
    }
  }
});

it("removes the subagent tool by default", async () => {
  process.env.HERDR_ENV = "1";
  writeProfile("worker.md", "---\ndescription: worker\n---\n\nWorker body.\n");

  const { agent } = await startRun(fakeHost());

  expect(agent.agentArgs).toEqual(expect.arrayContaining(["--exclude-tools", "subagent"]));
  expect(agent.agentArgs).not.toContain("--tools");
});

it("removes the renamed tool by default", async () => {
  process.env.HERDR_ENV = "1";
  writeConfig({ toolName: "child" });
  writeProfile("worker.md", "---\ndescription: worker\n---\n\nWorker body.\n");

  const { agent } = await startRun(fakeHost());

  expect(agent.agentArgs).toEqual(expect.arrayContaining(["--exclude-tools", "child"]));
  expect(agent.agentArgs).not.toContain("--tools");
});

it("maps skills", async () => {
  process.env.HERDR_ENV = "1";
  writeSkill(join(agentDir, "skills"), "a");
  writeSkill(join(agentDir, "skills"), "b");
  writeProfile("worker.md", "---\nskills: [a, b]\n---\n\nWorker body.\n");

  const named = await startRun(fakeHost());

  expect(named.agent.agentArgs).toEqual(
    expect.arrayContaining([
      "--no-skills",
      "--skill",
      join(agentDir, "skills", "a", "SKILL.md"),
      "--skill",
      join(agentDir, "skills", "b", "SKILL.md"),
    ]),
  );

  writeProfile("worker.md", "---\ndescription: none\n---\n\nWorker body.\n");

  const plain = await startRun(fakeHost());

  expect(plain.agent.agentArgs).not.toContain("--skill");
  expect(plain.agent.agentArgs).not.toContain("--no-skills");
});

it("resolves a skill from the project when the project is trusted", async () => {
  process.env.HERDR_ENV = "1";
  writeSkill(join(projectDir, ".pi", "skills"), "proj");
  writeProfile("worker.md", "---\nskills: [proj]\n---\n\nWorker body.\n");

  const { agent } = await startRun(fakeHost(), { trusted: true, cwd: projectDir });

  expect(agent.agentArgs).toEqual(
    expect.arrayContaining(["--skill", join(projectDir, ".pi", "skills", "proj", "SKILL.md")]),
  );
});

it("reports a missing skill as profile_invalid", async () => {
  process.env.HERDR_ENV = "1";
  writeProfile("worker.md", "---\nskills: [missing]\n---\n\nWorker body.\n");
  const fake = fakeHost();

  const result = await runTask(loadTool(fake.host), "inspect the repo", "worker");

  expect(result.isError).toBe(true);
  expect(result.details).toMatchObject({ code: "profile_invalid" });
  expect(firstText(result)).toContain('skill "missing"');
  expect(fake.agents).toEqual([]);
});

it("labels the pane with the first task line", async () => {
  process.env.HERDR_ENV = "1";

  const markdown = fakeHost();
  await startRun(markdown, { task: "## Fix   the **bug**\r\nsecond line" });

  expect(markdown.renamedPanes).toEqual([{ paneId: "w1:p1", label: "Fix the bug" }]);

  const long = fakeHost();
  await startRun(long, { task: "x".repeat(40) });

  expect(long.renamedPanes).toEqual([{ paneId: "w1:p1", label: "x".repeat(32) }]);
});

it("sets the auto-exit pane env", async () => {
  process.env.HERDR_ENV = "1";
  writeProfile("explore.md", "---\nauto-exit: true\n---\n\nExplore body.\n");
  const fake = fakeHost();
  const { tool } = loadSession(fake.host);

  await runTask(tool, "worker task");
  await runTask(tool, "explore task", "explore");

  expect(fake.tabs.map((tab) => tab.env)).toEqual([{ PI_SUBAGENT_AUTO_EXIT: "0" }, { PI_SUBAGENT_AUTO_EXIT: "1" }]);
});
