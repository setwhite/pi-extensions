import { mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import type { Turn } from "../../src/turn/index.ts";
import { classifyTurn, listTurns, nextTurn, readTurn, removeTurn, turnsDir, writeTurn } from "../../src/turn/index.ts";

function tempBase(): string {
  return join(mkdtempSync(join(tmpdir(), "pi-turn-")), "worker-1");
}

function turn(n: number, extra: Partial<Turn> = {}): Turn {
  return {
    turn: n,
    outcome: "done",
    stopReason: "stop",
    text: `answer ${n}`,
    children: 0,
    at: 1_700_000_000_000,
    ...extra,
  };
}

it("classifies a clean turn as done", () => {
  expect(classifyTurn({ stopReason: "stop", pendingToolCall: false, aborted: false })).toEqual({ outcome: "done" });
});

it("classifies a turn with no stopReason as done", () => {
  expect(classifyTurn({ stopReason: undefined, pendingToolCall: false, aborted: false })).toEqual({ outcome: "done" });
});

it("classifies retry exhaustion as error with the original message", () => {
  expect(
    classifyTurn({ stopReason: "error", pendingToolCall: false, aborted: false, errorMessage: "529 overloaded" }),
  ).toEqual({ outcome: "error", errorMessage: "529 overloaded" });
});

it("keeps an error verdict when the error has no message", () => {
  const verdict = classifyTurn({ stopReason: "error", pendingToolCall: false, aborted: false });
  expect(verdict.outcome).toBe("error");
  expect(verdict.errorMessage).toBeTruthy();
});

it("classifies a truncated answer as error", () => {
  const verdict = classifyTurn({ stopReason: "length", pendingToolCall: false, aborted: false });
  expect(verdict.outcome).toBe("error");
  expect(verdict.errorMessage).toContain("截断");
});

it("classifies an aborted turn as aborted", () => {
  expect(classifyTurn({ stopReason: "aborted", pendingToolCall: false, aborted: false })).toEqual({
    outcome: "aborted",
  });
});

it("classifies the settled aborted flag as aborted even with a clean stopReason", () => {
  expect(classifyTurn({ stopReason: "stop", pendingToolCall: false, aborted: true })).toEqual({ outcome: "aborted" });
});

it("classifies a pending tool call as aborted", () => {
  expect(classifyTurn({ stopReason: "toolUse", pendingToolCall: true, aborted: false })).toEqual({
    outcome: "aborted",
  });
});

it("classifies an unknown stopReason as error", () => {
  const verdict = classifyTurn({ stopReason: "deferred", pendingToolCall: false, aborted: false });
  expect(verdict.outcome).toBe("error");
  expect(verdict.errorMessage).toContain("deferred");
});

it("writes a turn atomically and reads it back", () => {
  const base = tempBase();
  const file = writeTurn(base, turn(1));
  expect(readTurn(file)).toEqual(turn(1));
  expect(readdirSync(turnsDir(base))).toEqual(["000001.json"]);
});

it("lists turns in numeric order no matter the write order", () => {
  const base = tempBase();
  writeTurn(base, turn(10));
  writeTurn(base, turn(2));
  writeTurn(base, turn(1));
  expect(listTurns(base).map((file) => readTurn(file)?.turn)).toEqual([1, 2, 10]);
});

it("reads a malformed turn as missing", () => {
  const base = tempBase();
  const file = writeTurn(base, turn(1));
  writeFileSync(file, "{");
  expect(readTurn(file)).toBeNull();
});

it("reads a turn missing required fields as missing", () => {
  const base = tempBase();
  const file = writeTurn(base, turn(1));
  writeFileSync(file, JSON.stringify({ turn: 1, run: "worker-1" }));
  expect(readTurn(file)).toBeNull();
});

it("removes a consumed turn and tolerates a repeated remove", () => {
  const base = tempBase();
  const file = writeTurn(base, turn(1));
  removeTurn(file);
  expect(listTurns(base)).toEqual([]);
  expect(() => removeTurn(file)).not.toThrow();
});

it("numbers turns monotonically across restarts", () => {
  const base = tempBase();
  expect(nextTurn(base)).toBe(1);
  expect(nextTurn(base)).toBe(2);
  expect(nextTurn(base)).toBe(3);
});

it("ignores a corrupted turn counter", () => {
  const base = tempBase();
  writeFileSync(`${base}.turn`, "not a number");
  expect(nextTurn(base)).toBe(1);
});

it("returns no turns for a run that never wrote one", () => {
  expect(listTurns(tempBase())).toEqual([]);
});
