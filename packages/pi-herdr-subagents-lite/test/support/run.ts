import { writeFileSync } from "node:fs";
import { expect, vi } from "vitest";
import type { SubagentTool } from "../../src/extension/index.ts";
import type { StartAgentInput } from "../../src/herdr/index.ts";
import type { RunStarted } from "../../src/run/index.ts";
import { fakeHost } from "./host.ts";
import { flushDelivery, parseStarted } from "./result.ts";
import { loadSession, loadTool } from "./session.ts";

export async function runProfiles(
  tool: SubagentTool,
  cases: Array<readonly [task: string, profile: string]>,
): Promise<RunStarted[]> {
  const started: RunStarted[] = [];
  for (const [task, profile] of cases) {
    const result = await runTask(tool, task, profile);
    expect(result.isError).toBe(false);
    started.push(parseStarted(result));
  }
  return started;
}

export function runTasks(tool: SubagentTool, count: number): Promise<RunStarted[]> {
  return runProfiles(
    tool,
    Array.from({ length: count }, (_, index) => [`task ${index + 1}`, "worker"] as const),
  );
}

export function runTask(tool: SubagentTool, task: string, profile = "worker", cwd?: string) {
  const params =
    cwd === undefined ? { action: "run" as const, profile, task } : { action: "run" as const, profile, task, cwd };
  return tool.execute("call-1", params, undefined, undefined, {} as never);
}

export function sendTask(tool: SubagentTool, name: string, message: string) {
  return tool.execute("call-2", { action: "send", name, message }, undefined, undefined, {} as never);
}

export async function lostChild(options: { profile?: string; cwd?: string } = {}) {
  vi.useFakeTimers();
  process.env.HERDR_ENV = "1";
  const profile = options.profile ?? "explore";
  const fake = fakeHost();
  fake.setAgents(async () => null);
  const session = loadSession(fake.host);
  const started = parseStarted(await runTask(session.tool, "inspect the repo", profile, options.cwd));
  writeFileSync(started.sessionFile, "");
  await vi.advanceTimersByTimeAsync(45_000);
  await flushDelivery(session.sent);
  return { ...session, fake, started };
}

export function startRun(
  fake: ReturnType<typeof fakeHost>,
  options: { profile?: string; task?: string; cwd?: string; trusted?: boolean } = {},
): Promise<{ agent: StartAgentInput; started: RunStarted }> {
  const tool = loadTool(fake.host, { isProjectTrusted: () => options.trusted === true });
  return runTask(tool, options.task ?? "inspect the repo", options.profile, options.cwd).then((result) => {
    const started = parseStarted(result);
    const agent = fake.agents[0];
    if (!agent) {
      throw new Error("expected startAgent to be called");
    }
    return { agent, started };
  });
}
