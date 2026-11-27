import { describe, expect, it } from "vitest";
import { HerdrError } from "../../src/herdr/index.ts";
import { errorText, ToolError } from "../../src/run/index.ts";

describe("errorText", () => {
  it("keeps the herdr error code", () => {
    expect(errorText(new HerdrError("agent_not_found", "no agent in pane w1:p2"))).toBe(
      "agent_not_found: no agent in pane w1:p2",
    );
  });

  it("passes plain errors and non-errors through", () => {
    expect(errorText(new ToolError("spawn_failed", "boom"))).toBe("boom");
    expect(errorText("just text")).toBe("just text");
  });
});
