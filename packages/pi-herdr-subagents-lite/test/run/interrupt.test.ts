import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HerdrError } from "../../src/herdr/index.ts";
import { cleanupRuns, setupRun, writeResult } from "../support/run-env.ts";

afterEach(async () => {
  await cleanupRuns();
});

describe("interrupt fallback", () => {
  it("reopens the pane from the watch loop when a busy child ignores esc past the grace", async () => {
    const { service, fake, problems } = setupRun({ interruptGraceMs: 30 });
    await service.spawn({ id: "alpha", objective: "x" });
    await vi.waitFor(() => expect(fake.pendingWaits()).toBe(1));
    fake.setAgentStatus("working");

    await expect(service.steer("alpha", "go left")).resolves.toEqual({ id: "alpha", status: "interrupting" });
    expect(fake.calls).toContain("sendKeys");

    await vi.waitFor(() => expect(fake.tabs).toHaveLength(2), { timeout: 2000 });
    await vi.waitFor(() => expect(fake.prompts.at(-1)).toContain("go left"));
    // 再等一个 grace 窗口：重开后截止时刻必须清掉，不能自己和自己抢着二次重开。
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(fake.tabs).toHaveLength(2);
    expect(fake.closedPanes).toEqual(["w1:p1"]);
    expect(service.inspect("alpha")[0]?.status).toBe("running");
    expect(problems.join(" ")).toContain("interrupt");
    service.shutdown();
  });

  it("reopens and resubmits when the queued message cannot be delivered in place", async () => {
    const { service, fake, runsDir, sessionsDir, batches, problems } = setupRun({ interruptGraceMs: 5000 });
    await service.spawn({ id: "alpha", objective: "x" });
    await vi.waitFor(() => expect(fake.pendingWaits()).toBe(1));
    fake.setAgentStatus("working");
    await service.steer("alpha", "continue here");
    await vi.waitFor(() => expect(fake.pendingWaits()).toBe(2));
    fake.failNext("prompt", new HerdrError("herdr_disconnected", "socket closed"));

    fake.resolveWait("idle");
    await vi.waitFor(() => expect(fake.tabs).toHaveLength(2));
    await vi.waitFor(() => expect(fake.prompts.at(-1)).toContain("continue here"));
    expect(fake.closedPanes).toEqual(["w1:p1"]);
    expect(fake.agents.at(-1)?.args).toContain(join(sessionsDir, "alpha", "session.jsonl"));
    expect(service.inspect("alpha")[0]?.status).toBe("running");
    expect(batches).toHaveLength(0);
    expect(problems.join(" ")).toContain("steer");

    await vi.waitFor(() => expect(fake.pendingWaits()).toBe(1));
    await writeResult(runsDir, "alpha", { seq: 2, state: "turn_end", text: "delivered" });
    fake.resolveWait("idle");

    await vi.waitFor(() => expect(batches).toHaveLength(1));
    expect(batches[0]?.[0]).toMatchObject({ status: "done", summary: "delivered" });
    service.shutdown();
  });

  it("reopens a finished run on its own session", async () => {
    const { service, fake, runsDir, sessionsDir, batches } = setupRun();
    await service.spawn({ id: "alpha", objective: "x" });
    await vi.waitFor(() => expect(fake.pendingWaits()).toBe(1));
    await writeResult(runsDir, "alpha", { seq: 1, state: "turn_end", text: "first" });
    fake.resolveWait("idle");
    await vi.waitFor(() => expect(batches).toHaveLength(1));

    await expect(service.steer("alpha", "one more thing")).resolves.toEqual({ id: "alpha", status: "running" });
    expect(fake.tabs).toHaveLength(2);
    expect(fake.agents.at(-1)?.args).toContain(join(sessionsDir, "alpha", "session.jsonl"));
    expect(fake.prompts.at(-1)).toContain("one more thing");
    service.shutdown();
  });

  it("refuses to revive a run when every slot is taken", async () => {
    const { service, fake, runsDir, batches } = setupRun({ maxConcurrent: 1 });
    await service.spawn({ id: "alpha", objective: "x" });
    await vi.waitFor(() => expect(fake.pendingWaits()).toBe(1));
    await writeResult(runsDir, "alpha", { seq: 1, state: "turn_end", text: "first" });
    fake.resolveWait("idle");
    await vi.waitFor(() => expect(batches).toHaveLength(1));
    await service.spawn({ id: "beta", objective: "y" });

    await expect(service.steer("alpha", "again")).rejects.toMatchObject({ code: "max_concurrent" });
    service.shutdown();
  });
});
