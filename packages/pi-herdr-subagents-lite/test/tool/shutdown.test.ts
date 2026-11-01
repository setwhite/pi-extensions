import { readFileSync, writeFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import type { CloseTabResult } from "../../src/herdr/index.ts";
import { writeConfig } from "../support/env.ts";
import { fakeHost } from "../support/host.ts";
import { writeProfile } from "../support/profiles.ts";
import { assistantLine, firstText, flushDelivery, parseStarted } from "../support/result.ts";
import { runTask, runTasks } from "../support/run.ts";
import { loadSession, loadTimedSession } from "../support/session.ts";
import "../support/hooks.ts";

it("does not split surrogate pairs when truncating", async () => {
  const { sent, tool } = loadTimedSession(async () => ({ status: "idle", completionSeq: 1 }));

  const started = parseStarted(await runTask(tool, "emoji report"));
  const head = `${"h".repeat(16383)}😀`;
  writeFileSync(started.sessionFile, `${assistantLine(`${head}${"z".repeat(100)}`)}\n`);

  await vi.advanceTimersByTimeAsync(1000);
  await flushDelivery(sent);

  const content = sent[0]?.message.content ?? "";
  expect(content).toContain("h".repeat(16383));
  expect(content).toContain("Full result:");
  expect(content).not.toMatch(/\p{Cs}/u);
  expect(readFileSync(`${started.sessionFile}.result-1.md`, "utf8")).toContain("😀");
});

async function expectDoneDespiteClose(closeTab: () => CloseTabResult | Error, closeFailed = false) {
  writeProfile("worker.md", "---\nauto-exit: true\n---\n\nWorker body.\n");
  const { calls, sent, tool } = loadTimedSession(async () => ({ status: "idle", completionSeq: 1 }), closeTab);

  const started = parseStarted(await runTask(tool, "say hello"));
  writeFileSync(started.sessionFile, `${assistantLine("hello")}\n`);

  await vi.advanceTimersByTimeAsync(1000);

  const content = sent[0]?.message.content ?? "";
  expect(sent).toHaveLength(closeFailed ? 2 : 1);
  expect(content.startsWith("[subagent worker-1] done")).toBe(true);
  expect(content).toContain("hello");
  expect(content).not.toContain("error");
  if (closeFailed) {
    expect(sent[1]?.message.content).toBe(
      `[subagent worker-1] result delivered, but the tab did not close\n\nSession file: ${started.sessionFile}`,
    );
  }
  expect(calls.filter((call) => call === "closeTabIfOnlyPane")).toHaveLength(1);

  const next = await runTask(tool, "next task");
  expect(next.isError).toBe(false);
  expect(parseStarted(next).name).toBe("worker-2");
}

it("keeps tab when close is refused", async () => {
  await expectDoneDespiteClose(() => "kept");
});

it("reports a failed close", async () => {
  await expectDoneDespiteClose(() => new Error("herdr tab close failed"), true);
});

it("stops after session shutdown", async () => {
  const { calls, sent, shutdownSession, tool } = loadTimedSession(async () => ({
    status: "working",
    completionSeq: 0,
  }));

  await runTask(tool, "long task");

  await shutdownSession();
  await vi.advanceTimersByTimeAsync(5000);

  expect(sent).toHaveLength(0);
  expect(calls.filter((call) => call === "closeTabIfOnlyPane")).toHaveLength(0);
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
  await vi.waitFor(() => expect(fake.calls).toContain("renamePane"));

  const closing = shutdownSession("quit");
  release();
  await closing;

  const result = await pending;
  expect(result.isError).toBe(true);
  expect(firstText(result)).toContain("cancelled");
  expect(fake.calls.filter((call) => call === "startAgent")).toHaveLength(0);
  expect(fake.calls.filter((call) => call === "closeTabIfOnlyPane")).toHaveLength(1);
});

it("closes children on matching reasons", async () => {
  writeConfig({ closeChildrenOn: ["quit"] });
  const { calls, sent, shutdownSession, tool } = loadTimedSession(async () => ({
    status: "working",
    completionSeq: 0,
  }));

  await runTasks(tool, 2);
  await shutdownSession("quit");
  await vi.advanceTimersByTimeAsync(5000);

  expect(calls.filter((call) => call === "closeTabIfOnlyPane")).toHaveLength(2);
  expect(sent.filter((message) => message.message.content.includes("unknown"))).toHaveLength(0);
});

it("keeps children when the reason does not match", async () => {
  writeConfig({ closeChildrenOn: ["resume"] });
  const { calls, shutdownSession, tool } = loadTimedSession(async () => ({
    status: "working",
    completionSeq: 0,
  }));

  await runTask(tool, "long task");
  await shutdownSession("quit");

  expect(calls.filter((call) => call === "closeTabIfOnlyPane")).toHaveLength(0);
});
