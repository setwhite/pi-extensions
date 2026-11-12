import { existsSync } from "node:fs";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { listTurns, readTurn } from "../../src/turn/index.ts";
import { childSessionFile, writeInbox } from "../support/inbox.ts";
import { baseOf, inboxOf } from "../support/paths.ts";
import { loadChild } from "../support/session.ts";
import "../support/hooks.ts";

it("writes a quit turn event for a child session", async () => {
  const sessionFile = childSessionFile();
  writeInbox(sessionFile, [["a.md", "queued"]]);
  const child = loadChild(sessionFile);

  await child.shutdownSession("quit");

  const files = listTurns(baseOf(sessionFile));
  expect(files).toHaveLength(1);
  const turn = readTurn(files[0] ?? "");
  expect(turn).toMatchObject({ outcome: "quit", stopReason: "quit" });
});

it("skips the quit event when there is no inbox", async () => {
  const sessionFile = childSessionFile();
  const child = loadChild(sessionFile);

  await child.shutdownSession("quit");

  expect(listTurns(baseOf(sessionFile))).toEqual([]);
});

it("skips the quit event on reload", async () => {
  const sessionFile = childSessionFile();
  writeInbox(sessionFile, [["a.md", "queued"]]);
  const child = loadChild(sessionFile);

  await child.shutdownSession("reload");

  expect(listTurns(baseOf(sessionFile))).toEqual([]);
});

it("delivers inbox messages in order", async () => {
  vi.useFakeTimers();
  const sessionFile = childSessionFile();
  writeInbox(sessionFile, [
    ["b.md", "second"],
    ["a.md", "first"],
  ]);
  const child = loadChild(sessionFile);

  await vi.advanceTimersByTimeAsync(250);

  expect(child.userMessages).toEqual([
    { content: "first", options: undefined },
    { content: "second", options: undefined },
  ]);
  expect(existsSync(join(inboxOf(sessionFile), "a.md"))).toBe(false);
  expect(existsSync(join(inboxOf(sessionFile), "b.md"))).toBe(false);
  expect(existsSync(join(inboxOf(sessionFile), ".delivered"))).toBe(false);

  await vi.advanceTimersByTimeAsync(250);

  expect(child.userMessages).toHaveLength(2);
});

it("steers while the child is busy", async () => {
  vi.useFakeTimers();
  const sessionFile = childSessionFile();
  writeInbox(sessionFile, [["a.md", "busy"]]);
  const child = loadChild(sessionFile, { isIdle: () => false });

  await vi.advanceTimersByTimeAsync(250);

  expect(child.userMessages).toEqual([{ content: "busy", options: { deliverAs: "steer" } }]);
});

it("does not poll without an inbox", async () => {
  vi.useFakeTimers();
  const child = loadChild(childSessionFile());

  await vi.advanceTimersByTimeAsync(1000);

  expect(child.userMessages).toEqual([]);
  expect(child.notifications).toEqual([]);
});

it("stops inbox polling on shutdown", async () => {
  vi.useFakeTimers();
  const sessionFile = childSessionFile();
  writeInbox(sessionFile, [["a.md", "before shutdown"]]);
  const child = loadChild(sessionFile);

  await vi.advanceTimersByTimeAsync(250);
  writeInbox(sessionFile, [["b.md", "after shutdown"]]);
  await child.shutdownSession();
  await vi.advanceTimersByTimeAsync(1000);

  expect(child.userMessages).toEqual([{ content: "before shutdown", options: undefined }]);
});

it("stops inbox polling after three failures", async () => {
  vi.useFakeTimers();
  const sessionFile = childSessionFile();
  writeInbox(sessionFile, [["a.md", "never delivered"]]);
  const child = loadChild(sessionFile);
  child.setSendUserMessage(() => {
    throw new Error("not ready");
  });

  await vi.advanceTimersByTimeAsync(750);

  expect(child.userMessages).toHaveLength(3);
  expect(child.notifications).toEqual([
    { message: expect.stringContaining("subagent messages stopped"), type: "error" },
  ]);

  await vi.advanceTimersByTimeAsync(2000);

  expect(child.userMessages).toHaveLength(3);
  expect(child.notifications).toHaveLength(1);
});
