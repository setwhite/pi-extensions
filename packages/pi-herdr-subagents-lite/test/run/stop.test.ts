import { afterEach, describe, expect, it } from "vitest";
import { cleanupRuns, setupRun } from "../support/run-env.ts";

afterEach(async () => {
  await cleanupRuns();
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

  it("reports unknown ids", async () => {
    const { service } = setupRun();

    await expect(service.stop("nope")).rejects.toMatchObject({ code: "unknown_id" });
    service.shutdown();
  });
});
