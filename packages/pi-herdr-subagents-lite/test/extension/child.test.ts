import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { registerChild } from "../../src/extension/child.ts";
import { readChildResult } from "../../src/run/index.ts";
import { testConfig } from "../support/config.ts";
import { fakePi } from "../support/fake-pi.ts";

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "pi-herdr-child-"));
}

describe("child extension", () => {
  it("registers only the request_input tool", () => {
    const { pi, tools } = fakePi();

    registerChild(pi, { runDir: tempDir(), loadConfig: () => testConfig() });

    expect(tools.map((tool) => tool.name)).toEqual(["request_input"]);
  });

  it("writes the assistant text on every turn end", async () => {
    const runDir = tempDir();
    const { pi, fire } = fakePi();
    registerChild(pi, { runDir, loadConfig: () => testConfig() });

    await fire("turn_end", {
      type: "turn_end",
      turnIndex: 1,
      message: {
        content: [
          { type: "text", text: "the answer" },
          { type: "toolCall", name: "read" },
        ],
      },
      toolResults: [],
    });

    expect(await readChildResult(runDir)).toMatchObject({ seq: 1, state: "turn_end", text: "the answer" });
  });

  it("does nothing without a run directory", () => {
    const { pi, tools } = fakePi();

    registerChild(pi, { runDir: undefined, loadConfig: () => testConfig() });

    expect(tools).toEqual([]);
  });
});
