import { describe, expect, it } from "vitest";
import { createRequestInputTool } from "../../src/tool/input.ts";
import { parameters } from "../../src/tool/schema.ts";
import { toolText } from "../../src/tool/text.ts";
import { testConfig } from "../support/config.ts";

interface Property {
  description?: string;
}

interface Variant {
  properties: Record<string, Property>;
}

const variants = (parameters as unknown as { oneOf: Variant[] }).oneOf;

function described(): string[] {
  const names: string[] = [];
  for (const variant of variants) {
    for (const [name, field] of Object.entries(variant.properties)) {
      if (field.description !== undefined) {
        names.push(name);
      }
    }
  }
  return names;
}

describe("tool schema", () => {
  it("describes only the fields whose name is not enough", () => {
    expect(described().sort()).toEqual(["message", "skills", "tools", "worktree"]);
  });

  it("spells out the traps that cost a wrong spawn", () => {
    const all = Object.assign({}, ...variants.map((variant) => variant.properties)) as Record<string, Property>;
    expect(all.tools?.description).toBe("Replaces default tool set; keep codemode if present.");
    expect(all.worktree?.description).toBe("Set true when child may write to this repo.");
    expect(all.skills?.description).toBe("Extra skill paths.");
    expect(all.message?.description).toBe("Interrupts a running child first.");
  });
});

describe("tool text", () => {
  const text = toolText(testConfig());

  it("sends a one-line description", () => {
    expect(text.description).toBe("Run and manage background subagents.");
  });

  it("sends no prompt snippet", () => {
    expect(text.promptSnippet).toBe("");
  });

  it("keeps only the cross-field rules", () => {
    expect(text.promptGuidelines).toHaveLength(3);
    expect(text.promptGuidelines.join("\n")).not.toMatch(/cannot spawn children/i);
  });

  it("tells the parent to stop after a spawn", () => {
    expect(text.promptGuidelines[0]).toBe("subagent: spawn is async; do not repeat the work or poll.");
  });

  it("tells the parent how to answer needs_input", () => {
    expect(text.promptGuidelines.join("\n")).toMatch(/on needs_input, steer the answer if known/i);
  });
});

describe("request_input text", () => {
  const tool = createRequestInputTool({ runDir: "/runs/alpha", summaryMaxChars: 2000 });

  it("keeps one guideline", () => {
    expect(tool.promptGuidelines).toEqual([
      "request_input: use this instead of asking in prose; the orchestrator relays human answers.",
    ]);
  });

  it("keeps the description", () => {
    expect(tool.description).toBe("Ask the orchestrator a question, then end your turn and wait for the answer.");
  });
});
