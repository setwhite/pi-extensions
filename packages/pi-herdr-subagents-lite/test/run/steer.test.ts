import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanupRuns, setupRun, writeResult } from "../support/run-env.ts";

afterEach(async () => {
  await cleanupRuns();
});

describe("steer", () => {
  it("interrupts a running child before delivering the message", async () => {
    const { service, fake, runsDir, batches } = setupRun({ interruptGraceMs: 5000 });
    await service.spawn({ id: "alpha", objective: "x" });
    await vi.waitFor(() => expect(fake.pendingWaits()).toBe(1));

    await expect(service.steer("alpha", "try the other file")).resolves.toEqual({
      id: "alpha",
      status: "interrupting",
    });
    expect(fake.calls).toContain("sendKeys");

    fake.resolveWait("idle");
    await vi.waitFor(() => expect(fake.prompts.at(-1)).toContain("try the other file"));
    await vi.waitFor(() => expect(fake.pendingWaits()).toBe(1));

    await writeResult(runsDir, "alpha", { seq: 2, state: "turn_end", text: "second answer" });
    fake.resolveWait("idle");

    await vi.waitFor(() => expect(batches).toHaveLength(1));
    expect(batches[0]?.[0]).toMatchObject({ status: "done", summary: "second answer" });
    service.shutdown();
  });

  it("discards the interrupted turn's result and settles on the answer after the steer", async () => {
    const { service, fake, runsDir, batches } = setupRun({ interruptGraceMs: 5000 });
    await service.spawn({ id: "alpha", objective: "x" });
    await vi.waitFor(() => expect(fake.pendingWaits()).toBe(1));

    await service.steer("alpha", "answer with beta");
    // esc 生效：被打断的半截回合先落了 result.json，父侧不能拿它当结算。
    await writeResult(runsDir, "alpha", { seq: 1, state: "turn_end", text: "half an answer" });
    fake.resolveWait("idle");
    await vi.waitFor(() => expect(fake.prompts.at(-1)).toContain("answer with beta"));
    await vi.waitFor(() => expect(fake.pendingWaits()).toBe(1));

    await writeResult(runsDir, "alpha", { seq: 2, state: "turn_end", text: "beta" });
    fake.resolveWait("idle");

    await vi.waitFor(() => expect(batches).toHaveLength(1));
    expect(batches[0]?.[0]).toMatchObject({ status: "done", summary: "beta" });
    service.shutdown();
  });

  it("keeps only the latest message while interrupting", async () => {
    const { service, fake } = setupRun({ interruptGraceMs: 5000 });
    await service.spawn({ id: "alpha", objective: "x" });
    await vi.waitFor(() => expect(fake.pendingWaits()).toBe(1));

    await service.steer("alpha", "first");
    await service.steer("alpha", "second");
    fake.resolveWait("idle");

    await vi.waitFor(() => expect(fake.prompts.at(-1)).toContain("second"));
    expect(fake.prompts.join(" ")).not.toContain("first");
    service.shutdown();
  });

  it("reopens the pane when the interrupt never settles", async () => {
    const { service, fake, problems } = setupRun({ interruptGraceMs: 30 });
    await service.spawn({ id: "alpha", objective: "x" });
    await vi.waitFor(() => expect(fake.pendingWaits()).toBe(1));

    await service.steer("alpha", "go left");

    await vi.waitFor(() => expect(fake.tabs).toHaveLength(2), { timeout: 2000 });
    await vi.waitFor(() => expect(fake.prompts.at(-1)).toContain("go left"));
    expect(fake.closedPanes).toEqual(["w1:p1"]);
    expect(service.inspect("alpha")[0]?.status).toBe("running");
    expect(problems.join(" ")).toContain("interrupt");
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

  it("reports unknown ids", async () => {
    const { service } = setupRun();

    await expect(service.steer("nope", "x")).rejects.toMatchObject({ code: "unknown_id" });
    await expect(service.stop("nope")).rejects.toMatchObject({ code: "unknown_id" });
    service.shutdown();
  });
});

describe("stop", () => {
  it("closes the pane once and stays idempotent", async () => {
    const { service, fake } = setupRun();
    await service.spawn({ id: "alpha", objective: "x" });

    await expect(service.stop("alpha")).resolves.toEqual({ id: "alpha", status: "cancelled" });
    await expect(service.stop("alpha")).resolves.toEqual({ id: "alpha", status: "cancelled" });

    expect(fake.closedPanes).toEqual(["w1:p1"]);
    expect(service.inspect("alpha")[0]?.status).toBe("cancelled");
    service.shutdown();
  });

  it("closes every child pane on shutdown", async () => {
    const { service, fake } = setupRun();
    await service.spawn({ id: "alpha", objective: "x" });
    await service.spawn({ id: "beta", objective: "y" });

    await expect(service.closeChildren()).resolves.toEqual({ failed: [] });
    expect(fake.closedPanes).toEqual(["w1:p1", "w1:p2"]);
  });
});
