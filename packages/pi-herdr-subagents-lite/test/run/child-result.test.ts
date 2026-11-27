import { mkdtempSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { clearChildQuestions, readChildResult, writeChildResult } from "../../src/run/index.ts";
import { outputPath, resultPath } from "../../src/run/paths.ts";

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "pi-herdr-result-"));
}

describe("child result file", () => {
  it("bumps the sequence on every write", async () => {
    const dir = tempDir();

    expect(await writeChildResult(dir, { state: "turn_end", text: "a", limit: 10 })).toBe(1);
    expect(await writeChildResult(dir, { state: "needs_input", questions: [{ question: "q" }], limit: 10 })).toBe(2);

    expect(await readChildResult(dir)).toMatchObject({
      seq: 2,
      state: "needs_input",
      questions: [{ question: "q" }],
    });
  });

  it("keeps needs_input across the follow-up turns the tool result triggers", async () => {
    const dir = tempDir();
    const questions = [{ question: "which branch?", options: ["main", "next"] }];

    await writeChildResult(dir, { state: "needs_input", questions, limit: 10 });
    await writeChildResult(dir, { state: "turn_end", text: "Ending turn.", limit: 10 });
    await writeChildResult(dir, { state: "turn_end", text: "Ending turn again.", limit: 10 });

    expect(await readChildResult(dir)).toMatchObject({
      seq: 3,
      state: "needs_input",
      questions,
      text: "Ending turn again.",
    });
  });

  it("writes turn_end again after the parent answers", async () => {
    const dir = tempDir();

    await writeChildResult(dir, { state: "needs_input", questions: [{ question: "q" }], limit: 10 });
    await clearChildQuestions(dir);
    await writeChildResult(dir, { state: "turn_end", text: "done", limit: 10 });

    expect(await readChildResult(dir)).toMatchObject({ seq: 2, state: "turn_end", text: "done" });
  });

  it("spills text past the limit and records the path", async () => {
    const dir = tempDir();
    const text = "y".repeat(50);

    await writeChildResult(dir, { state: "turn_end", text, limit: 10 });

    expect(await readFile(outputPath(dir), "utf8")).toBe(text);
    expect(await readChildResult(dir)).toMatchObject({ output: outputPath(dir) });
  });

  it("leaves no temporary file behind", async () => {
    const dir = tempDir();
    await writeChildResult(dir, { state: "turn_end", text: "a", limit: 10 });

    expect((await readdir(dir)).sort()).toEqual(["result.json"]);
    expect(await readFile(resultPath(dir), "utf8")).toContain('"seq":1');
  });

  it("reports a missing result as undefined", async () => {
    expect(await readChildResult(tempDir())).toBeUndefined();
  });
});
