import { writeFileSync } from "node:fs";
import { expect, it } from "vitest";
import { writeConfig } from "../support/env.ts";
import { fakeHost } from "../support/host.ts";
import { writeProfile } from "../support/profiles.ts";
import { eventually, firstText, flushDelivery, parseStarted } from "../support/result.ts";
import { runTask, runTasks, sendTask } from "../support/run.ts";
import { loadSession } from "../support/session.ts";
import { settleTurn } from "../support/turn.ts";
import "../support/hooks.ts";

it("closes the pane after delivering a done turn when auto-exit is true", async () => {
  process.env.HERDR_ENV = "1";
  writeProfile("worker.md", "---\nauto-exit: true\n---\n\nWorker body.\n");
  const calls: string[] = [];
  const fake = fakeHost({ events: calls });
  const { sent, tool } = loadSession(fake.host);
  const started = parseStarted(await runTask(tool, "say hello"));
  settleTurn(started.sessionFile, { text: "hello" });
  await eventually(() => calls.includes("closePane"));

  expect(sent).toHaveLength(1);
  expect(sent[0]?.message.content.startsWith("[subagent worker-1] done")).toBe(true);
  expect(calls.indexOf("sendMessage")).toBeLessThan(calls.indexOf("closePane"));

  const next = await runTask(tool, "next task");
  expect(next.isError).toBe(false);
  expect(parseStarted(next).name).toBe("worker-2");
});

it("resumes a child whose pane was closed after a done turn", async () => {
  process.env.HERDR_ENV = "1";
  writeProfile("worker.md", "---\nauto-exit: true\n---\n\nWorker body.\n");
  const calls: string[] = [];
  const fake = fakeHost({ events: calls });
  const { tool } = loadSession(fake.host);
  const started = parseStarted(await runTask(tool, "say hello"));
  writeFileSync(started.sessionFile, "");
  settleTurn(started.sessionFile, { text: "hello" });
  await eventually(() => calls.includes("closePane"));

  const reply = await sendTask(tool, "worker-1", "one more");

  expect(reply.isError).toBe(false);
  expect(reply.details).toMatchObject({ state: "restarted", name: "worker-1" });
  expect((reply.details as { paneId: string }).paneId).not.toBe(started.paneId);
  expect(fake.agents).toHaveLength(2);
});

it("reports a failed close once and still frees the slot", async () => {
  process.env.HERDR_ENV = "1";
  writeProfile("worker.md", "---\nauto-exit: true\n---\n\nWorker body.\n");
  const fake = fakeHost({ closePane: () => new Error("herdr pane close failed") });
  const { notifications, sent, tool } = loadSession(fake.host);
  const started = parseStarted(await runTask(tool, "say hello"));
  settleTurn(started.sessionFile, { text: "hello" });
  await eventually(() => notifications.some((item) => item.message.includes("could not close")));

  expect(sent).toHaveLength(1);
  expect(fake.calls.filter((call) => call === "closePane")).toHaveLength(3);

  const next = await runTask(tool, "next task");
  expect(next.isError).toBe(false);
  expect(parseStarted(next).name).toBe("worker-2");
});

it("does not close a failed turn by default", async () => {
  process.env.HERDR_ENV = "1";
  const fake = fakeHost();
  const { sent, tool } = loadSession(fake.host);
  const started = parseStarted(await runTask(tool, "may fail"));
  settleTurn(started.sessionFile, { outcome: "error", stopReason: "error", errorMessage: "529 overloaded" });
  await flushDelivery(sent);

  expect(sent[0]?.message.content).toContain("[subagent worker-1] failed");
  expect(sent[0]?.message.content).toContain("529 overloaded");
  expect(fake.calls).not.toContain("closePane");
});

it("closes the pane when the child quits", async () => {
  process.env.HERDR_ENV = "1";
  const fake = fakeHost();
  const { sent, tool } = loadSession(fake.host);
  const started = parseStarted(await runTask(tool, "quit soon"));
  settleTurn(started.sessionFile, { outcome: "quit", stopReason: "quit" });
  await eventually(() => fake.calls.includes("closePane"));

  expect(sent[0]?.message.content).toContain("stopped before reporting a result");
});

it("stops after session shutdown", async () => {
  process.env.HERDR_ENV = "1";
  writeConfig({ closeChildrenOn: [] });
  const fake = fakeHost();
  const { sent, shutdownSession, tool } = loadSession(fake.host);

  await runTask(tool, "long task");

  await shutdownSession();
  await new Promise((resolve) => setTimeout(resolve, 30));

  expect(sent).toHaveLength(0);
  expect(fake.calls).not.toContain("closePane");
});

it("cancels an in-flight start when the session shuts down", async () => {
  writeConfig({ closeChildrenOn: ["quit"] });
  process.env.HERDR_ENV = "1";
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const fake = fakeHost({ hooks: { renamePane: () => gate } });
  const { shutdownSession, tool } = loadSession(fake.host);
  const pending = runTask(tool, "slow start");
  await eventually(() => fake.calls.includes("renamePane"));

  const closing = shutdownSession("quit");
  release();
  await closing;

  const result = await pending;
  expect(result.isError).toBe(true);
  expect(firstText(result)).toContain("cancelled");
  expect(fake.calls.filter((call) => call === "startAgent")).toHaveLength(0);
  expect(fake.calls.filter((call) => call === "closePane")).toHaveLength(1);
});

it("closes children on matching reasons", async () => {
  writeConfig({ closeChildrenOn: ["quit"] });
  process.env.HERDR_ENV = "1";
  const fake = fakeHost();
  const { shutdownSession, tool } = loadSession(fake.host);

  await runTasks(tool, 2);
  await shutdownSession("quit");

  expect(fake.calls.filter((call) => call === "closePane")).toHaveLength(2);
});

it("keeps children when the reason is not listed", async () => {
  writeConfig({ closeChildrenOn: [] });
  process.env.HERDR_ENV = "1";
  const fake = fakeHost();
  const { shutdownSession, tool } = loadSession(fake.host);

  await runTask(tool, "stay");
  await shutdownSession("quit");

  expect(fake.calls).not.toContain("closePane");
});
