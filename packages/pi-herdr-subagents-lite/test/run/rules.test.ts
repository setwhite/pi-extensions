import { describe, expect, it } from "vitest";
import { canTransition, checkStart, occupiesSlot, type RunStatus, truncateSummary } from "../../src/run/rules.ts";

describe("checkStart", () => {
  const base = { existingIds: [] as string[], slottedCount: 0, maxConcurrent: 2 };

  it("accepts a fresh id", () => {
    expect(checkStart({ ...base, id: "alpha" })).toBe("ok");
  });

  it("rejects an id that breaks the pattern", () => {
    for (const id of ["Alpha", "1alpha", "al pha", "", "a".repeat(33)]) {
      expect(checkStart({ ...base, id })).toBe("invalid_id");
    }
  });

  it("rejects a duplicate id", () => {
    expect(checkStart({ ...base, id: "alpha", existingIds: ["alpha"] })).toBe("duplicate_id");
  });

  it("rejects a new id once every slot is taken", () => {
    expect(checkStart({ ...base, id: "beta", slottedCount: 2 })).toBe("max_concurrent");
  });

  it("lets an already known id through the slot gate", () => {
    expect(checkStart({ ...base, id: "alpha", existingIds: ["alpha"], slottedCount: 2 })).toBe("duplicate_id");
  });
});

describe("occupiesSlot", () => {
  it("counts only live phases", () => {
    const live: RunStatus[] = ["starting", "running", "interrupting"];
    const settled: RunStatus[] = ["needs_input", "done", "failed", "cancelled"];
    expect(live.every(occupiesSlot)).toBe(true);
    expect(settled.some(occupiesSlot)).toBe(false);
  });
});

describe("canTransition", () => {
  it("allows the documented edges", () => {
    expect(canTransition("starting", "running")).toBe(true);
    expect(canTransition("running", "interrupting")).toBe(true);
    expect(canTransition("interrupting", "running")).toBe(true);
    expect(canTransition("done", "running")).toBe(true);
    expect(canTransition("failed", "running")).toBe(true);
  });

  it("keeps cancelled terminal", () => {
    expect(canTransition("cancelled", "running")).toBe(false);
  });
});

describe("truncateSummary", () => {
  it("keeps short text untouched", () => {
    expect(truncateSummary("short", 10)).toEqual({ summary: "short", truncated: false });
  });

  it("cuts long text at the limit", () => {
    expect(truncateSummary("abcdef", 3)).toEqual({ summary: "abc", truncated: true });
  });
});
