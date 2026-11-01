import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { writeConfig } from "../support/env.ts";
import { fakeHost } from "../support/host.ts";
import { fakePi } from "../support/pi.ts";
import { sessionsRoot, writeProfile } from "../support/profiles.ts";
import { startRun } from "../support/run.ts";
import { loadTool, registerExtension } from "../support/session.ts";
import "../support/hooks.ts";

it("accepts run and send", () => {
  const tool = loadTool(fakeHost().host);

  expect(tool.name).toBe("subagent");
  expect(tool.label).toBe("Subagent");

  const schema = tool.parameters as unknown as {
    type: string;
    oneOf: Array<{
      type: string;
      properties: Record<string, Record<string, unknown>>;
      required: string[];
      additionalProperties: boolean;
    }>;
  };
  expect(schema.type).toBe("object");
  expect(schema.oneOf).toHaveLength(2);

  const [run, send] = schema.oneOf;
  expect(run?.type).toBe("object");
  expect(run?.properties.action).toMatchObject({ const: "run" });
  expect(run?.properties.task).toMatchObject({ type: "string", minLength: 1 });
  expect(run?.required).toEqual(["action", "profile", "task"]);
  expect(run?.additionalProperties).toBe(false);

  expect(send?.type).toBe("object");
  expect(send?.properties.action).toMatchObject({ const: "send" });
  expect(send?.properties.name).toMatchObject({ type: "string", pattern: "^[a-z][a-z0-9_-]{0,31}$" });
  expect(send?.properties.message).toMatchObject({ type: "string", minLength: 1 });
  expect(send?.required).toEqual(["action", "name", "message"]);
  expect(send?.additionalProperties).toBe(false);
});

it("reports config errors without registering", () => {
  writeConfig({ nope: 1 });
  const { pi, tools } = fakePi();

  expect(() => registerExtension(pi, fakeHost().host)).toThrow(/nope/);
  expect(tools).toHaveLength(0);
});

it("resolves the agent dir for config", () => {
  const home = mkdtempSync(join(tmpdir(), "pi-herdr-home-"));
  const configDir = join(home, "agent", "pi-herdr-subagents-lite");
  mkdirSync(configDir, { recursive: true });
  writeFileSync(join(configDir, "config.json"), JSON.stringify({ toolName: "tilde_tool" }));
  vi.stubEnv("HOME", home);
  vi.stubEnv("USERPROFILE", home);
  vi.stubEnv("PI_CODING_AGENT_DIR", "~/agent");
  try {
    expect(loadTool(fakeHost().host).name).toBe("tilde_tool");
  } finally {
    vi.unstubAllEnvs();
    rmSync(home, { recursive: true, force: true });
  }
});

it("rejects outside herdr", async () => {
  const { calls, host } = fakeHost();
  const tool = loadTool(host);

  const result = await tool.execute(
    "call-1",
    { action: "run", profile: "worker", task: "inspect the repo" },
    undefined,
    undefined,
    {} as never,
  );

  expect(result.isError).toBe(true);
  expect(result.content).toEqual([
    {
      type: "text",
      text: "not_in_herdr: run pi inside a herdr pane; there is no fallback.",
    },
  ]);
  expect(calls).toEqual([]);
});

it("keeps the default prompt short", () => {
  const tool = loadTool(fakeHost().host);

  expect(tool.description).toBe("Run subagents and send them messages.");
  expect(tool.promptSnippet).toBe("");
  expect(tool.promptGuidelines).toEqual([
    "subagent: The parent handles user interaction, cross-task synthesis, and decisions; subagents execute.",
    "subagent: run only starts; it does not wait. The result arrives later as a message.",
    "subagent: send only delivers; no state tracking.",
    expect.stringMatching(/^subagent: Available profiles:\n/),
  ]);
});

it("launches a worker", async () => {
  process.env.HERDR_ENV = "1";
  const fake = fakeHost();
  const { agent, started } = await startRun(fake);

  expect(started).toMatchObject({ state: "running", name: "worker-1", paneId: "w1:p1" });
  expect(fake.tabs).toEqual([{ cwd: process.cwd(), label: "worker-1", env: { PI_SUBAGENT_AUTO_EXIT: "0" } }]);
  expect(agent).toMatchObject({ name: "worker-1", paneId: started.paneId, sessionFile: started.sessionFile });
  const brief = await readFile(`${started.sessionFile}.brief.md`, "utf8");
  expect(brief).toBe("# Task\ninspect the repo\n");
});

it("writes the child session under the agent dir", async () => {
  process.env.HERDR_ENV = "1";
  writeProfile("explore.md", "---\ndescription: Explore the repo\n---\n\nExplore body.\n");
  const { agent, started } = await startRun(fakeHost(), { profile: "explore" });

  expect(started.sessionFile).toBe(agent.sessionFile);
  expect(started.sessionFile.startsWith(join(sessionsRoot(), "explore-1-"))).toBe(true);
  expect(started.sessionFile.endsWith(".jsonl")).toBe(true);
  expect(existsSync(sessionsRoot())).toBe(true);
});

it("creates the child inbox before start", async () => {
  process.env.HERDR_ENV = "1";
  const fake = fakeHost();

  const { started } = await startRun(fake);

  expect(existsSync(`${started.sessionFile}.inbox`)).toBe(true);
  expect(fake.inboxAtStart).toEqual([0]);
});
