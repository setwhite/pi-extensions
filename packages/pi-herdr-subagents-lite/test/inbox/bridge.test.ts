import { expect, it } from "vitest";
import { createBridge } from "../../src/bridge/index.ts";
import type { BlockedKind, Config } from "../../src/config/index.ts";

type PromptEvent = { kind: BlockedKind; title?: string };

function fakePi() {
  const start: Array<(event: PromptEvent) => void> = [];
  const end: Array<(event: PromptEvent) => void> = [];
  const emitted: Array<{ active: boolean; label?: string }> = [];
  return {
    emitted,
    start(event: PromptEvent) {
      for (const handler of start) {
        handler(event);
      }
    },
    end(event: PromptEvent) {
      for (const handler of end) {
        handler(event);
      }
    },
    pi: {
      on(event: "ui_prompt_start" | "ui_prompt_end", handler: (event: PromptEvent) => void) {
        (event === "ui_prompt_start" ? start : end).push(handler);
      },
      events: {
        emit(channel: string, data: { active: boolean; label?: string }) {
          if (channel === "herdr:blocked") {
            emitted.push(data);
          }
        },
      },
    },
  };
}

function bridgeConfig(patch: Partial<Config["bridge"]> = {}): Config["bridge"] {
  return { enabled: true, blockedOn: ["custom", "select", "confirm", "input", "editor"], ...patch };
}

it("emits blocked for dialogs", () => {
  const fake = fakePi();
  createBridge(fake.pi, bridgeConfig());

  fake.start({ kind: "confirm", title: "Run this command?" });
  fake.end({ kind: "confirm", title: "Run this command?" });
  fake.start({ kind: "custom" });

  expect(fake.emitted).toEqual([
    { active: true, label: "Run this command?" },
    { active: false },
    { active: true, label: "custom" },
  ]);
});

it("filters kinds by blockedOn", () => {
  const fake = fakePi();
  createBridge(fake.pi, bridgeConfig({ blockedOn: ["custom"] }));

  fake.start({ kind: "select" });
  fake.end({ kind: "select" });
  fake.start({ kind: "custom" });

  expect(fake.emitted).toEqual([{ active: true, label: "custom" }]);
});

it("stays silent when disabled", () => {
  const fake = fakePi();
  createBridge(fake.pi, bridgeConfig({ enabled: false }));

  fake.start({ kind: "custom" });
  fake.end({ kind: "custom" });

  expect(fake.emitted).toHaveLength(0);
});
