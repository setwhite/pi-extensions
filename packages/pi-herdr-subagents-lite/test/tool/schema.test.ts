import { describe, expect, it } from "vitest";
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

function property(name: string): Property | undefined {
  for (const variant of variants) {
    if (variant.properties[name] !== undefined) {
      return variant.properties[name];
    }
  }
  return undefined;
}

describe("tool schema", () => {
  it("describes every parameter", () => {
    const missing: string[] = [];
    for (const variant of variants) {
      for (const [name, field] of Object.entries(variant.properties)) {
        if (typeof field.description !== "string" || field.description.trim() === "") {
          missing.push(name);
        }
      }
    }

    expect(missing).toEqual([]);
  });

  it("spells out the traps that cost a wrong spawn", () => {
    expect(property("objective")?.description).toMatch(/task/i);
    expect(property("context")?.description).toMatch(/omit when the objective stands alone/i);
    expect(property("tools")?.description).toMatch(/omit to inherit/i);
    expect(property("worktree")?.description).toMatch(/may write/i);
  });
});

describe("tool text", () => {
  const text = toolText(testConfig());

  it("sends no prompt snippet", () => {
    expect(text.promptSnippet).toBe("");
  });

  it("keeps only the cross-field rules", () => {
    expect(text.promptGuidelines).toHaveLength(3);
    expect(text.promptGuidelines.join("\n")).not.toMatch(/cannot spawn children/i);
  });

  it("tells the parent how to answer needs_input", () => {
    expect(text.promptGuidelines.join("\n")).toMatch(/on needs_input, steer the answer directly/i);
  });
});
