import { existsSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { HerdrHostError } from "../../src/herdr/index.ts";
import { projectDir, writeConfig } from "../support/env.ts";
import { fakeHost } from "../support/host.ts";
import { sessionsRoot, writeProfile, writeProjectProfile } from "../support/profiles.ts";
import { firstText, parseStarted } from "../support/result.ts";
import { runProfiles, runTask } from "../support/run.ts";
import { loadSession, loadTool } from "../support/session.ts";
import "../support/hooks.ts";

it("expands profiles in guidelines", () => {
  process.env.HERDR_ENV = "1";
  writeProfile("explore.md", "---\ndescription: Explore the repo\n---\n\nExplore body.\n");

  const defaults = loadSession(fakeHost().host);
  expect(defaults.tool.promptGuidelines?.join("\n")).toContain("explore — Explore the repo");

  writeProfile("named.md", "---\nname: Explorer\ndescription: Named profile\n---\n\nNamed body.\n");
  const named = loadSession(fakeHost().host);
  expect(named.tool.promptGuidelines?.join("\n")).toContain("Explorer — Named profile");
  expect(named.tool.promptGuidelines?.join("\n")).not.toContain("named (Explorer)");

  writeConfig({ prompts: { guidelines: ["Ask for a self-contained task."] } });
  const overridden = loadSession(fakeHost().host);
  expect(overridden.tool.promptGuidelines).toEqual(["subagent: Ask for a self-contained task."]);

  writeConfig({ prompts: { snippet: "" } });
  const hidden = loadSession(fakeHost().host);
  expect(hidden.tool.promptSnippet).toBe("");
});

it("reads project profiles only when trusted", async () => {
  process.env.HERDR_ENV = "1";
  writeProfile("worker.md", "---\ndescription: Global worker\n---\n\nGlobal body.\n");
  writeProjectProfile("worker.md", "---\ndescription: Project worker\n---\n\nProject body.\n");
  writeProjectProfile("project.md", "---\ndescription: Project profile\n---\n\nProject body.\n");

  const untrusted = loadSession(fakeHost().host);
  const untrustedGuidelines = untrusted.tool.promptGuidelines?.join("\n") ?? "";
  expect(untrustedGuidelines).not.toContain("Project worker");
  expect(untrustedGuidelines).not.toContain("Project profile");
  expect(firstText(await runTask(untrusted.tool, "inspect", "project"))).toContain("unknown_profile");

  const trusted = loadSession(fakeHost().host, [], { cwd: projectDir, isProjectTrusted: () => true });
  const trustedGuidelines = trusted.tool.promptGuidelines?.join("\n") ?? "";
  expect(trustedGuidelines).toContain("worker — Project worker");
  expect(trustedGuidelines).not.toContain("Global worker");
  expect(trustedGuidelines).toContain("project — Project profile");
  expect(parseStarted(await runTask(trusted.tool, "inspect", "project")).name).toBe("project-1");
});

it("hides non-invocable profiles", async () => {
  process.env.HERDR_ENV = "1";
  writeProfile("secret.md", "---\ndescription: Hidden profile\ndisable-model-invocation: true\n---\n\nSecret body.\n");

  const tool = loadTool(fakeHost().host);
  expect(tool.promptGuidelines?.join("\n")).not.toContain("secret");

  const result = await runTask(tool, "inspect", "secret");
  expect(result.isError).toBe(false);
  expect(parseStarted(result).name).toBe("secret-1");
});

it("names runs after the profile", async () => {
  process.env.HERDR_ENV = "1";
  writeProfile("explore.md", "---\ndescription: Explore\n---\n\nExplore body.\n");
  const { host } = fakeHost();
  const tool = loadTool(host);

  const started = await runProfiles(tool, [
    ["first explore", "explore"],
    ["second explore", "explore"],
  ]);

  expect(started.map((run) => run.name)).toEqual(["explore-1", "explore-2"]);
});

it("slugifies profile names", async () => {
  process.env.HERDR_ENV = "1";
  writeProfile("Code Review!.md", "---\ndescription: Review\n---\n\nReview body.\n");
  writeProfile("9lives.md", "---\ndescription: Nine\n---\n\nNine body.\n");
  writeProfile("a-very-long-profile-name.md", "---\ndescription: Long\n---\n\nLong body.\n");
  const { host } = fakeHost();
  const tool = loadTool(host);

  const started = await runProfiles(tool, [
    ["review", "Code Review!"],
    ["nine", "9lives"],
    ["long", "a-very-long-profile-name"],
  ]);

  expect(started.map((run) => run.name)).toEqual(["code-review-1", "agent-9lives-1", "a-very-long-prof-1"]);
});

it("retries name_taken with next worker", async () => {
  process.env.HERDR_ENV = "1";
  const calls: string[] = [];
  const { agents, host, renamedTabs } = fakeHost({
    events: calls,
    failures: { startAgent: (attempt) => (attempt === 1 ? new HerdrHostError("name_taken", "taken") : undefined) },
  });
  const { sent, tool } = loadSession(host, calls);

  const started = parseStarted(await runTask(tool, "retry task"));

  expect(started.name).toBe("worker-2");
  expect(calls.filter((call) => call === "createTab")).toHaveLength(1);
  expect(calls.filter((call) => call === "startAgent")).toHaveLength(2);
  expect(renamedTabs).toEqual([{ tabId: "w1:t1", label: "worker-2" }]);
  expect(agents[0]?.sessionFile.startsWith(join(sessionsRoot(), "worker-1-"))).toBe(true);
  expect(agents[1]?.sessionFile.startsWith(join(sessionsRoot(), "worker-2-"))).toBe(true);
  expect(agents[1]?.sessionFile).not.toBe(agents[0]?.sessionFile);
  expect(existsSync(`${agents[1]?.sessionFile}.brief.md`)).toBe(true);
  const [firstAgent, secondAgent] = agents;
  if (!firstAgent || !secondAgent) {
    throw new Error("expected two startAgent calls");
  }
  expect(existsSync(`${firstAgent.sessionFile}.brief.md`)).toBe(false);
  expect(existsSync(`${firstAgent.sessionFile}.identity.md`)).toBe(false);
  expect(existsSync(`${firstAgent.sessionFile}.inbox`)).toBe(false);
  expect(existsSync(`${secondAgent.sessionFile}.brief.md`)).toBe(true);
  expect(existsSync(`${secondAgent.sessionFile}.identity.md`)).toBe(true);
  expect(existsSync(`${secondAgent.sessionFile}.inbox`)).toBe(true);
  expect(sent).toHaveLength(0);
});
