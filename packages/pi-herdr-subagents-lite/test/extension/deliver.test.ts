import { describe, expect, it } from "vitest";
import { deliverEnvelopes } from "../../src/extension/deliver.ts";
import { fakePi } from "../support/fake-pi.ts";

describe("deliverEnvelopes", () => {
  it("sends one aggregated follow-up", () => {
    const { pi, messages } = fakePi();

    deliverEnvelopes(pi, [
      { id: "alpha", status: "done", summary: "did it", paths: {} },
      {
        id: "beta",
        status: "needs_input",
        questions: [{ question: "which branch?", options: ["main", "next"] }],
        paths: {},
      },
    ]);

    expect(messages).toHaveLength(1);
    expect(messages[0]?.options).toEqual({ triggerTurn: true, deliverAs: "followUp" });
    const content = messages[0]?.message.content ?? "";
    expect(content).toContain("[subagent alpha] done");
    expect(content).toContain("? which branch? [main | next]");
  });

  it("keeps session and run paths out of the model face", () => {
    const { pi, messages } = fakePi();

    deliverEnvelopes(pi, [{ id: "alpha", status: "done", summary: "did it", paths: {} }]);

    const content = messages[0]?.message.content ?? "";
    expect(content).not.toContain("session:");
    expect(content).not.toContain(".jsonl");
    expect(content).not.toContain("/runs");
  });

  it("mentions the spilled full text", () => {
    const { pi, messages } = fakePi();

    deliverEnvelopes(pi, [
      {
        id: "alpha",
        status: "done",
        summary: "head",
        truncated: true,
        paths: { output: "/runs/alpha/output.md" },
      },
    ]);

    expect(messages[0]?.message.content).toContain("full text: /runs/alpha/output.md");
  });

  it("sends nothing for an empty batch", () => {
    const { pi, messages } = fakePi();
    deliverEnvelopes(pi, []);

    expect(messages).toEqual([]);
  });
});
