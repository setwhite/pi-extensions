import { expect, it, vi } from "vitest";
import { fakeHost } from "../support/host.ts";
import { eventually } from "../support/result.ts";
import { runTask } from "../support/run.ts";
import { loadSession } from "../support/session.ts";
import "../support/hooks.ts";

it("does not mark a starting run lost when liveness polls before the pane exists", async () => {
  process.env.HERDR_ENV = "1";
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.useFakeTimers();
  const fake = fakeHost({ hooks: { createTab: () => gate } });
  fake.setAgents(async () => null);
  const { sent, tool } = loadSession(fake.host);

  const pending = runTask(tool, "slow pane");
  await vi.advanceTimersByTimeAsync(45_000);
  expect(sent).toHaveLength(0);

  release();
  const result = await pending;

  expect(result.isError).toBe(false);
  expect(sent).toHaveLength(0);
});

it("stops a start in flight when the tool call is aborted", async () => {
  process.env.HERDR_ENV = "1";
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const fake = fakeHost({ hooks: { createTab: () => gate } });
  const { sent, tool } = loadSession(fake.host);
  const controller = new AbortController();

  const pending = tool.execute(
    "call-1",
    { action: "run" as const, profile: "worker", task: "slow pane" },
    controller.signal,
    undefined,
    {} as never,
  );
  await eventually(() => fake.calls.includes("createTab"));
  controller.abort();
  release();
  const result = await pending;

  expect(result.isError).toBe(true);
  expect(result.details).toMatchObject({ code: "spawn_failed" });
  expect(fake.agents).toHaveLength(0);
  expect(fake.calls).toContain("closePane");
  expect(sent).toHaveLength(0);
});
