// 用例 3：子代理 working 时 steer，验证 esc 打断 -> idle -> 新 prompt 投递 -> 正常结算。
import { describe, expect, it } from "vitest";
import { useE2e } from "./fixture.ts";
import { prereqs } from "./prereq.ts";
import { waitFor } from "./process.ts";

const state = prereqs();

describe.skipIf(!state.ok)(`e2e: steer while working${state.ok ? "" : ` (skipped: ${state.reason})`}`, () => {
  const e2e = useE2e();

  it("interrupts the running turn and settles on the new answer", async () => {
    const env = e2e();
    const id = `turning-${Date.now().toString(36)}`;
    const spawned = await env.service.spawn({
      id,
      objective: "Run the bash command 'sleep 20'. Wait for it to finish, then reply with exactly: alpha.",
    });

    await waitFor(async () => (await env.paneStatus(spawned.paneId)) === "working", "child to start working", 180_000);
    await expect(env.service.steer(id, "Stop what you are doing. Reply with exactly: beta")).resolves.toEqual({
      id,
      status: "interrupting",
    });

    const envelope = await waitFor(() => env.envelopes().find((entry) => entry.id === id), "settled envelope", 180_000);

    console.log(`[e2e] steer -> ${envelope.status}: ${envelope.summary}`);
    expect(envelope.status).toBe("done");
    expect(envelope.summary ?? "").toMatch(/beta/i);
    expect(env.problems).toEqual([]);
  }, 240_000);
});
