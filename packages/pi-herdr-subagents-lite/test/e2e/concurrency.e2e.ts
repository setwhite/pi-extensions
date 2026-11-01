import { describe, expect, it } from "vitest";
import { useHerdrE2e, writeExploreProfile } from "./fixture.ts";
import { errors, prereqs, results, type StartedRun, waitFor } from "./harness.ts";

const state = prereqs();

describe.skipIf(!state.ok)(`herdr e2e: maxConcurrent${state.ok ? "" : ` (skipped: ${state.reason})`}`, () => {
  const harness = useHerdrE2e(writeExploreProfile);

  it("rejects a run above maxConcurrent", async () => {
    const e2e = harness();
    e2e.writeConfig({ maxConcurrent: 2, inboxPollMs: 100, pollIntervalMs: 200, idlePollIntervalMs: 200 });
    const { sessionFile: parent } = await e2e.startParent("parent3");
    await e2e.prompt(
      "parent3",
      [
        "Call the subagent tool exactly three times in this turn, all with action run and profile explore.",
        "Task 1: run the bash command 'sleep 30' then answer exactly ONE.",
        "Task 2: run the bash command 'sleep 30' then answer exactly TWO.",
        "Task 3: run the bash command 'sleep 30' then answer exactly THREE.",
        "Do not wait for results between calls. End your turn after the third call.",
      ].join("\n"),
    );

    await waitFor(() => errors(parent, "max_concurrent")[0], "max_concurrent error");
    expect(results<StartedRun>(parent, "running")).toHaveLength(2);
    const children = (await e2e.tabs()).filter((tab) => /^explore-\d+$/.test(tab.label));
    expect(children).toHaveLength(2);
    await e2e.closeChildren();
    e2e.writeConfig({ maxConcurrent: 16, inboxPollMs: 100, pollIntervalMs: 200, idlePollIntervalMs: 200 });
  });
});
