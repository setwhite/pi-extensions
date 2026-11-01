import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { useHerdrE2e, writeExploreProfile } from "./fixture.ts";
import {
  messages,
  prereqs,
  type RestartedRun,
  results,
  type SentMessage,
  type StartedRun,
  waitFor,
} from "./harness.ts";

const state = prereqs();

function lineCount(file: string): number {
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "").length;
}

describe.skipIf(!state.ok)(`herdr e2e: child send${state.ok ? "" : ` (skipped: ${state.reason})`}`, () => {
  const harness = useHerdrE2e(writeExploreProfile);
  let parent5: { sessionFile: string; paneId: string };

  it("sends into a live child and keeps a split tab open", async () => {
    const e2e = harness();
    parent5 = await e2e.startParent("parent5");
    const parent = parent5.sessionFile;
    await e2e.prompt(
      "parent5",
      "Call subagent exactly once with action run, profile explore, task: run the bash command 'sleep 30' then answer exactly FIRST. Do not wait for the result; end your turn immediately after the tool returns.",
    );

    const started = await waitFor(() => results<StartedRun>(parent, "running")[0], "running result");
    const tab = await waitFor(() => e2e.tabFor(started.name), "worker tab");
    const pane = (await e2e.panes()).find((entry) => entry.tab_id === tab.tab_id);
    await e2e.call([
      "pane",
      "split",
      "--pane",
      (pane as { pane_id: string }).pane_id,
      "--direction",
      "right",
      "--no-focus",
    ]);

    const first = await waitFor(() => messages(parent, "subagent_result")[0], "first result");
    expect(first).toContain("FIRST");
    const kept = await waitFor(() => e2e.tabFor(started.name), "tab still open");
    expect(kept.pane_count).toBe(2);

    const lines = lineCount(started.sessionFile);
    await e2e.prompt(
      "parent5",
      `Call the subagent tool exactly once with action send, name ${started.name}, and message exactly: Answer exactly SECOND and call no tools. Do not call run. End your turn after the tool returns.`,
    );
    await waitFor(() => results<SentMessage>(parent, "sent")[0], "sent result");
    const second = await waitFor(() => messages(parent, "subagent_result")[1], "second result");
    expect(second).toContain("SECOND");
    expect(lineCount(started.sessionFile)).toBeGreaterThan(lines);
    expect((await e2e.tabFor(started.name))?.pane_count).toBe(2);
  });

  it("restarts an exited child in a new pane", async () => {
    const e2e = harness();
    const parent = parent5.sessionFile;
    const name = (await waitFor(() => results<SentMessage>(parent, "sent")[0], "sent result")).name;
    const tab = await waitFor(() => e2e.tabFor(name), "worker tab");
    const before = (await e2e.panes()).find((entry) => entry.tab_id === tab.tab_id);

    await e2e.call(["tab", "close", tab.tab_id]);
    await waitFor(
      async () => (await e2e.agents()).every((agent) => agent.pane_id !== (before as { pane_id: string }).pane_id),
      "child pane to disappear",
    );

    await e2e.prompt(
      "parent5",
      `Call the subagent tool exactly once with action send, name ${name}, and message exactly: run the bash command 'sleep 20' then answer exactly THIRD. Do not call run. End your turn after the tool returns.`,
    );
    const restarted = await waitFor(() => results<RestartedRun>(parent, "restarted")[0], "restarted result");
    expect(restarted.name).toBe(name);
    expect(restarted.paneId).not.toBe((before as { pane_id: string }).pane_id);

    const third = await waitFor(() => messages(parent, "subagent_result")[2], "third result", 120_000);
    expect(third).toContain("THIRD");
    await e2e.closeChildren();
  });
});
