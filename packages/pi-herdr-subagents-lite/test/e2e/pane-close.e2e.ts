// 用例 1：子代理运行中途关掉它的 pane，实测 agent.wait 的真实返回与 run 的兜底判定。
import { describe, expect, it } from "vitest";
import { useE2e } from "./fixture.ts";
import { prereqs } from "./prereq.ts";
import { waitFor } from "./process.ts";

const state = prereqs();

describe.skipIf(!state.ok)(`e2e: pane closed mid-run${state.ok ? "" : ` (skipped: ${state.reason})`}`, () => {
  const e2e = useE2e();

  it("fails the run and keeps the herdr error code", async () => {
    const env = e2e();
    const id = `closing-${Date.now().toString(36)}`;
    const spawned = await env.service.spawn({
      id,
      objective: "Run the bash command 'sleep 30'. Wait for it to finish, then reply with exactly: done.",
    });

    await waitFor(async () => (await env.paneStatus(spawned.paneId)) === "working", "child to start working", 180_000);
    await env.client.closePane(spawned.paneId);
    const envelope = await waitFor(() => env.envelopes().find((entry) => entry.id === id), "failure envelope", 180_000);

    expect(envelope.status).toBe("failed");
    expect(envelope.summary ?? "").toMatch(/pane or agent went away/);
    // 两个错误码都可能出现，取决于 close 落在 wait 在途还是下一条请求，见 docs/research/0008。
    expect(envelope.summary ?? "").toMatch(/agent_not_(running|found)/);
    console.log(`[e2e] pane close -> run summary: ${envelope.summary}`);
    expect(env.problems.join(" ")).toContain(`${id}: pane or agent went away`);
  }, 240_000);
});
