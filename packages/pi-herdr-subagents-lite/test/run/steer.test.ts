import { afterEach, describe, expect, it, vi } from "vitest";
import { advanceMicrotasks, pumpIdle } from "../support/pump.ts";
import { cleanupRuns, setupRun, writeResult } from "../support/run-env.ts";

afterEach(async () => {
  await cleanupRuns();
});

describe("steer", () => {
  it("does not send esc when herdr already reports the child idle", async () => {
    const { service, fake, runsDir, batches } = setupRun({ interruptGraceMs: 5000 });
    await service.spawn({ id: "alpha", objective: "x" });
    await vi.waitFor(() => expect(fake.pendingWaits()).toBe(1));
    // 子代理刚好写完结果回到 idle，watcher 还没来得及结算。
    await writeResult(runsDir, "alpha", { seq: 1, state: "turn_end", text: "finished early" });
    fake.setAgentStatus("idle");

    await expect(service.steer("alpha", "one more")).resolves.toEqual({ id: "alpha", status: "interrupting" });
    expect(fake.calls).not.toContain("sendKeys");

    await vi.waitFor(() => expect(fake.pendingWaits()).toBe(2));
    fake.resolveWait("idle");
    await vi.waitFor(() => expect(fake.prompts.at(-1)).toContain("one more"));
    expect(batches).toHaveLength(0);

    await vi.waitFor(() => expect(fake.pendingWaits()).toBe(1));
    await writeResult(runsDir, "alpha", { seq: 2, state: "turn_end", text: "second answer" });
    fake.resolveWait("idle");

    await vi.waitFor(() => expect(batches).toHaveLength(1));
    expect(batches[0]?.[0]).toMatchObject({ status: "done", summary: "second answer" });
    service.shutdown();
  });

  it("keeps the pending steer when it lands while the result is being read", async () => {
    const { service, fake, runsDir, batches } = setupRun({ interruptGraceMs: 5000 });
    await service.spawn({ id: "alpha", objective: "x" });
    await vi.waitFor(() => expect(fake.pendingWaits()).toBe(1));
    await writeResult(runsDir, "alpha", { seq: 1, state: "turn_end", text: "finished" });
    fake.setAgentStatus("idle");

    fake.resolveWait("idle");
    // watcher 已经拿到 idle，正卡在读 result.json 的异步读盘上。
    await advanceMicrotasks();

    await expect(service.steer("alpha", "next step")).resolves.toEqual({ id: "alpha", status: "interrupting" });
    expect(fake.closedPanes).toEqual([]);
    expect(batches).toHaveLength(0);

    await vi.waitFor(() => expect(fake.prompts.at(-1)).toContain("next step"));
    expect(batches).toHaveLength(0);
    expect(service.inspect("alpha")[0]?.status).toBe("running");

    await vi.waitFor(() => expect(fake.pendingWaits()).toBe(1));
    await writeResult(runsDir, "alpha", { seq: 2, state: "turn_end", text: "next answer" });
    fake.resolveWait("idle");

    await vi.waitFor(() => expect(batches).toHaveLength(1));
    expect(batches[0]?.[0]).toMatchObject({ status: "done", summary: "next answer" });
    service.shutdown();
  });

  it("interrupts a busy child before delivering the message", async () => {
    const { service, fake, runsDir, batches } = setupRun({ interruptGraceMs: 5000 });
    await service.spawn({ id: "alpha", objective: "x" });
    await vi.waitFor(() => expect(fake.pendingWaits()).toBe(1));
    fake.setAgentStatus("working");

    await expect(service.steer("alpha", "try the other file")).resolves.toEqual({
      id: "alpha",
      status: "interrupting",
    });
    expect(fake.calls).toContain("sendKeys");

    await vi.waitFor(() => expect(fake.pendingWaits()).toBe(2));
    fake.resolveWait("idle");
    await vi.waitFor(() => expect(fake.prompts.at(-1)).toContain("try the other file"));
    expect(batches).toHaveLength(0);

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
    fake.setAgentStatus("working");

    await service.steer("alpha", "answer with beta");
    // esc 生效：被打断的半截回合先落了 result.json，父侧不能拿它当结算。
    await writeResult(runsDir, "alpha", { seq: 1, state: "turn_end", text: "half an answer" });
    await vi.waitFor(() => expect(fake.pendingWaits()).toBe(2));
    fake.resolveWait("idle");
    await vi.waitFor(() => expect(fake.prompts.at(-1)).toContain("answer with beta"));
    expect(batches).toHaveLength(0);

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
    fake.setAgentStatus("working");

    await service.steer("alpha", "first");
    await service.steer("alpha", "second");
    await pumpIdle(fake, () => (fake.prompts.at(-1) ?? "").includes("second"));

    expect(fake.prompts.at(-1)).toContain("second");
    expect(fake.prompts.join(" ")).not.toContain("first");
    service.shutdown();
  });

  it("reports unknown ids", async () => {
    const { service } = setupRun();

    await expect(service.steer("nope", "x")).rejects.toMatchObject({ code: "unknown_id" });
    service.shutdown();
  });
});
