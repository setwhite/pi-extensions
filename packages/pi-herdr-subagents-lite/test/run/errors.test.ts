import { describe, expect, it } from "vitest";
import { HerdrError } from "../../src/herdr/index.ts";
import { errorText, ToolError } from "../../src/run/index.ts";

describe("errorText", () => {
  it("keeps the herdr error code and hides the pane", () => {
    expect(errorText(new HerdrError("agent_not_found", "no agent in pane w1:p2"))).toBe(
      "agent_not_found: no agent in pane <pane>",
    );
  });

  it("hides local paths in herdr and fs messages", () => {
    expect(errorText(new HerdrError("herdr_failed", 'cwd "C:\\repo\\wt" is gone'))).toBe(
      'herdr_failed: cwd "<path>" is gone',
    );
    expect(errorText(new Error("ENOENT: no such file or directory, open '/tmp/runs/alpha/result.json'"))).toBe(
      "ENOENT: no such file or directory, open '<path>'",
    );
  });

  it("passes plain errors and non-errors through", () => {
    expect(errorText(new ToolError("spawn_failed", "boom"))).toBe("boom");
    expect(errorText("just text")).toBe("just text");
  });
});
