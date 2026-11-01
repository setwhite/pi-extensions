import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { useHerdrE2e, writeExploreProfile } from "./fixture.ts";
import { messages, prereqs, results, type StartedRun, waitFor } from "./harness.ts";

const state = prereqs();
const TASK_READ = "read README.md and answer with its first heading";

describe.skipIf(!state.ok)(`herdr e2e: run lifecycle${state.ok ? "" : ` (skipped: ${state.reason})`}`, () => {
  const harness = useHerdrE2e((e2e) => {
    writeExploreProfile(e2e);
    e2e.writeProfile("selfexit", "description: Exit when done\nauto-exit: true", "Answer briefly, then stop.");
  });

  it("run delivers a done result and keeps the tab", async () => {
    const e2e = harness();
    const { sessionFile: parent } = await e2e.startParent("parent1");
    await e2e.prompt(
      "parent1",
      `Call subagent exactly once with action run, profile explore, task: ${TASK_READ}. Do not call it again. Do not wait for the result; end your turn after the tool returns.`,
    );

    const started = await waitFor(() => results<StartedRun>(parent, "running")[0], "running result");
    expect(started.name).toBe("explore-1");
    expect(dirname(started.sessionFile)).toBe(join(e2e.agentDir, "pi-herdr-subagents-lite", "sessions"));

    const done = await waitFor(() => messages(parent, "subagent_result")[0], "done result");
    expect(done).toContain(`[subagent ${started.name}] done`);
    expect(done).toContain("E2E Project");

    expect(await e2e.tabFor(started.name)).toBeDefined();
    const agents = await e2e.agents();
    expect(["idle", "done"]).toContain(agents.find((agent) => agent.name === started.name)?.agent_status);
    await e2e.closeChildren();
  });

  it("auto-exit closes the tab after the result", async () => {
    const e2e = harness();
    const { sessionFile: parent } = await e2e.startParent("parent2");
    await e2e.prompt(
      "parent2",
      `Call subagent exactly once with action run, profile selfexit, task: ${TASK_READ}. Do not call it again. Do not wait for the result; end your turn after the tool returns.`,
    );

    const started = await waitFor(() => results<StartedRun>(parent, "running")[0], "running result");
    const done = await waitFor(() => messages(parent, "subagent_result")[0], "done result");
    expect(done).toContain(`[subagent ${started.name}] done`);

    await waitFor(async () => (await e2e.tabFor(started.name)) === undefined, "tab to close", 60_000);
    const agents = await e2e.agents();
    expect(agents.find((agent) => agent.name === started.name)).toBeUndefined();
  });
});
