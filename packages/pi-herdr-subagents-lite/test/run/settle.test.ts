import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanupRuns, setupRun, writeResult } from "../support/run-env.ts";

afterEach(async () => {
  await cleanupRuns();
});

describe("settle", () => {
  it("delivers the child summary and closes the pane", async () => {
    const { service, fake, runsDir, batches } = setupRun();
    await service.spawn({ id: "alpha", objective: "x" });
    await vi.waitFor(() => expect(fake.pendingWaits()).toBe(1));

    await writeResult(runsDir, "alpha", { seq: 1, state: "turn_end", text: "finished the job" });
    fake.resolveWait("idle");

    await vi.waitFor(() => expect(batches).toHaveLength(1));
    expect(batches[0]?.[0]).toEqual({
      id: "alpha",
      status: "done",
      summary: "finished the job",
      paths: {},
    });
    expect(fake.closedPanes).toEqual(["w1:p1"]);
    expect(service.inspect("alpha")[0]?.status).toBe("done");
    service.shutdown();
  });

  it("keeps the pane and forwards the questions when the child asks", async () => {
    const { service, fake, runsDir, batches } = setupRun();
    await service.spawn({ id: "alpha", objective: "x" });
    await vi.waitFor(() => expect(fake.pendingWaits()).toBe(1));

    const questions = [{ question: "which branch?", options: ["main", "release"] }];
    await writeResult(runsDir, "alpha", { seq: 1, state: "needs_input", questions });
    fake.resolveWait("idle");

    await vi.waitFor(() => expect(batches).toHaveLength(1));
    expect(batches[0]?.[0]?.status).toBe("needs_input");
    expect(batches[0]?.[0]?.questions).toEqual(questions);
    expect(fake.closedPanes).toEqual([]);
    service.shutdown();
  });

  it("cuts a long summary and points at the spilled file", async () => {
    const { service, fake, runsDir, batches } = setupRun();
    await service.spawn({ id: "alpha", objective: "x" });
    await vi.waitFor(() => expect(fake.pendingWaits()).toBe(1));

    await writeResult(runsDir, "alpha", {
      seq: 1,
      state: "turn_end",
      text: "x".repeat(100),
      output: join(runsDir, "alpha", "output.md"),
    });
    fake.resolveWait("idle");

    await vi.waitFor(() => expect(batches).toHaveLength(1));
    const envelope = batches[0]?.[0];
    expect(envelope?.summary).toHaveLength(40);
    expect(envelope?.truncated).toBe(true);
    expect(envelope?.paths.output).toBe(join(runsDir, "alpha", "output.md"));
    service.shutdown();
  });

  it("reports a paneless child as failed", async () => {
    const { service, fake, batches } = setupRun();
    await service.spawn({ id: "alpha", objective: "x" });
    await vi.waitFor(() => expect(fake.pendingWaits()).toBe(1));

    fake.rejectWait(new Error("agent_not_found"));

    await vi.waitFor(() => expect(batches).toHaveLength(1));
    expect(batches[0]?.[0]).toMatchObject({ id: "alpha", status: "failed" });
    expect(service.inspect("alpha")[0]?.status).toBe("failed");
    service.shutdown();
  });

  it("fails a child that settles without writing a result", async () => {
    const { service, fake, batches } = setupRun();
    await service.spawn({ id: "alpha", objective: "x" });

    // prompt 之后会有一串「还是 idle」的旧状态；超出容忍窗口就判失败。
    for (let round = 0; round < 12 && batches.length === 0; round++) {
      if (fake.pendingWaits() > 0) {
        fake.resolveWait("idle");
      }
      await new Promise((resolve) => setTimeout(resolve, 30));
    }

    await vi.waitFor(() => expect(batches).toHaveLength(1), { timeout: 3000 });
    expect(batches[0]?.[0]).toMatchObject({ id: "alpha", status: "failed" });
    expect(batches[0]?.[0]?.summary).toContain("without writing result.json");
    service.shutdown();
  });
});
