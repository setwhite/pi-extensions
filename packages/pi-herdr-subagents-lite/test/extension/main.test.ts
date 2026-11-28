import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { registerMain } from "../../src/extension/main.ts";
import { testConfig } from "../support/config.ts";
import { fakeClient } from "../support/fake-client.ts";
import { fakePi } from "../support/fake-pi.ts";

function setup(overrides: Parameters<typeof testConfig>[0] = {}) {
  const fake = fakeClient();
  const runsDir = mkdtempSync(join(tmpdir(), "pi-herdr-main-"));
  const harness = fakePi();
  registerMain(harness.pi, {
    loadConfig: () => testConfig(overrides),
    createClient: () => fake.client,
    runsDir: () => runsDir,
    sessionsDir: () => mkdtempSync(join(tmpdir(), "pi-herdr-main-sessions-")),
  });
  return { ...harness, fake, runsDir };
}

type Executable = {
  name: string;
  execute(id: string, params: unknown): Promise<{ isError: boolean; content: Array<{ text: string }> }>;
};

describe("main extension", () => {
  it("registers the control tool on session start", async () => {
    const { fire, tools } = setup();
    process.env.HERDR_ENV = "1";

    await fire("session_start", { type: "session_start", reason: "new" });

    expect(tools.map((tool) => tool.name)).toEqual(["subagent"]);
    delete process.env.HERDR_ENV;
  });

  it("registers nothing when disabled", async () => {
    const { fire, tools } = setup({ enabled: false });

    await fire("session_start", { type: "session_start", reason: "new" });

    expect(tools).toEqual([]);
  });

  it("closes child panes and the socket on quit", async () => {
    process.env.HERDR_ENV = "1";
    const { fire, tools, fake } = setup();
    await fire("session_start", { type: "session_start", reason: "new" });
    const tool = tools[0] as unknown as Executable;
    await tool.execute("call", { action: "spawn", id: "alpha", objective: "x" });

    await fire("session_shutdown", { type: "session_shutdown", reason: "quit" });

    expect(fake.closedPanes).toEqual(["w1:p1"]);
    expect(fake.calls).toContain("close");
    delete process.env.HERDR_ENV;
  });

  it("leaves children alone when the reason is not configured", async () => {
    process.env.HERDR_ENV = "1";
    const { fire, tools, fake } = setup({ closeChildrenOn: ["quit"] });
    await fire("session_start", { type: "session_start", reason: "new" });
    const tool = tools[0] as unknown as Executable;
    await tool.execute("call", { action: "spawn", id: "alpha", objective: "x" });

    await fire("session_shutdown", { type: "session_shutdown", reason: "reload" });

    expect(fake.closedPanes).toEqual([]);
    expect(fake.calls).toContain("close");
    delete process.env.HERDR_ENV;
  });
});
