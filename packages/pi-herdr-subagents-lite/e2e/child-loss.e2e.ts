import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { useHerdrE2e, writeExploreProfile } from "./fixture.ts";
import { hasToolCall, killProcess, messages, prereqs, results, type StartedRun, sleep, waitFor } from "./harness.ts";

const state = prereqs();
// 被杀的子代理按 session 尾部结算：尾部有未完成 toolCall 走 pane_exited，否则读 3 次后是 no_result。
const NO_RESULT_TEXTS = ["the pane exited without a result", "no result was read"];

describe.skipIf(!state.ok)(`herdr e2e: child loss${state.ok ? "" : ` (skipped: ${state.reason})`}`, () => {
  const harness = useHerdrE2e(writeExploreProfile);
  let parent4: { sessionFile: string; paneId: string };

  it("reports a killed child without a result", async () => {
    const e2e = harness();
    parent4 = await e2e.startParent("parent4");
    const parent = parent4.sessionFile;
    await e2e.prompt(
      "parent4",
      "Call subagent exactly once with action run, profile explore, task: run the bash command 'sleep 60' then answer exactly KILL. Do not wait for the result.",
    );

    const started = await waitFor(() => results<StartedRun>(parent, "running")[0], "running result");
    await waitFor(() => hasToolCall(started.sessionFile), "child to start working");
    const tab = await waitFor(() => e2e.tabFor(started.name), "worker tab");
    const pane = (await e2e.panes()).find((entry) => entry.tab_id === tab.tab_id);
    expect(pane).toBeDefined();

    killProcess(await e2e.childPid((pane as { pane_id: string }).pane_id));

    const unknown = await waitFor(() => messages(parent, "subagent_result")[0], "unknown result", 60_000);
    expect(NO_RESULT_TEXTS.some((text) => unknown.includes(`[subagent ${started.name}] ${text}`))).toBe(true);
    expect(unknown).toContain(`Session file: ${started.sessionFile}`);
    expect(await e2e.tabFor(started.name)).toBeDefined();
    await e2e.closeChildren();
  });

  it("does not reclaim children after /new", async () => {
    const e2e = harness();
    await waitFor(
      async () =>
        ["idle", "done"].includes((await e2e.agents()).find((agent) => agent.name === "parent4")?.agent_status ?? ""),
      "parent4 idle",
    );
    const before = new Set(readdirSync(join(e2e.agentDir, "sessions")));
    await e2e.type(parent4.paneId, "/new");
    await sleep(2000);
    await e2e.prompt("parent4", "Reply with exactly READY-NEW and call no tools.");

    const fresh = await waitFor(
      () => {
        for (const file of readdirSync(join(e2e.agentDir, "sessions"))) {
          if (!file.endsWith(".jsonl") || before.has(file)) {
            continue;
          }
          const path = join(e2e.agentDir, "sessions", file);
          if (readFileSync(path, "utf8").includes("READY-NEW")) {
            return path;
          }
        }
        return undefined;
      },
      "READY-NEW in a new session",
      90_000,
    );

    expect(messages(fresh, "subagent_result")).toHaveLength(0);
  });
});
