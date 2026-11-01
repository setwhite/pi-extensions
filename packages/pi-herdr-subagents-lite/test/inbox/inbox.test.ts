import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createInbox, drain, enqueue, hasInbox, inboxCount, removeInbox } from "../../src/inbox/index.ts";

let root = "";

function sessionFile(name = "child.jsonl"): string {
  return join(root, name);
}

function inboxDir(name = "child.jsonl"): string {
  return `${sessionFile(name)}.inbox`;
}

function pending(name = "child.jsonl"): string[] {
  return readdirSync(inboxDir(name))
    .filter((entry) => entry.endsWith(".md"))
    .sort();
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "pi-herdr-inbox-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

it("creates and detects the inbox", async () => {
  expect(hasInbox(sessionFile())).toBe(false);

  await createInbox(sessionFile());

  expect(hasInbox(sessionFile())).toBe(true);
  expect(existsSync(inboxDir())).toBe(true);

  writeFileSync(join(root, "plain.jsonl.inbox"), "not a directory");

  expect(hasInbox(sessionFile("plain.jsonl"))).toBe(false);
});

it("removes an inbox and its messages", async () => {
  await createInbox(sessionFile());
  await enqueue(sessionFile(), "one");

  removeInbox(sessionFile());

  expect(hasInbox(sessionFile())).toBe(false);
  expect(existsSync(inboxDir())).toBe(false);
});

it("enqueues markdown messages in send order", async () => {
  await enqueue(sessionFile(), "first");
  await enqueue(sessionFile(), "second");

  const names = pending();
  expect(names).toHaveLength(2);
  expect(names.every((name) => name.endsWith(".md"))).toBe(true);

  const delivered: string[] = [];
  const count = await drain(sessionFile(), (text) => {
    delivered.push(text);
  });

  expect(count).toBe(2);
  expect(delivered).toEqual(["first", "second"]);
});

it("removes delivered messages", async () => {
  await enqueue(sessionFile(), "one");

  await drain(sessionFile(), () => {});

  expect(pending()).toEqual([]);
  expect(readdirSync(inboxDir())).toEqual([]);
  expect(existsSync(join(inboxDir(), ".delivered"))).toBe(false);
});

it("counts only pending messages", async () => {
  await createInbox(sessionFile());
  await enqueue(sessionFile(), "first");
  await enqueue(sessionFile(), "second");

  expect(inboxCount(sessionFile())).toBe(2);

  drain(sessionFile(), () => {});

  expect(inboxCount(sessionFile())).toBe(0);
});

it("keeps a failed message and stops the drain", async () => {
  await enqueue(sessionFile(), "first");
  await enqueue(sessionFile(), "second");
  const seen: string[] = [];

  expect(() =>
    drain(sessionFile(), (text) => {
      seen.push(text);
      if (seen.length === 2) {
        throw new Error("delivery failed");
      }
    }),
  ).toThrow("delivery failed");

  expect(seen).toEqual(["first", "second"]);
  expect(pending()).toHaveLength(1);

  const retried: string[] = [];
  await drain(sessionFile(), (text) => {
    retried.push(text);
  });

  expect(retried).toEqual(["second"]);
});

it("treats a missing inbox as empty", async () => {
  const count = await drain(sessionFile(), () => {
    throw new Error("must not deliver");
  });

  expect(count).toBe(0);
});
