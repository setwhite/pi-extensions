import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createExtension } from "../../src/extension/index.ts";
import { testConfig } from "../support/config.ts";
import { fakeClient } from "../support/fake-client.ts";
import { fakePi } from "../support/fake-pi.ts";

function deps(depth: number, runDir: string | undefined) {
  const fake = fakeClient();
  return {
    loadConfig: () => testConfig({ runRetentionMs: 0 }),
    createClient: () => fake.client,
    runsDir: () => mkdtempSync(join(tmpdir(), "pi-herdr-runs-")),
    sessionsDir: () => mkdtempSync(join(tmpdir(), "pi-herdr-sessions-")),
    depth,
    runDir,
  };
}

describe("createExtension", () => {
  it("gives the control tool to the main agent", () => {
    const { pi, tools } = fakePi();
    createExtension(deps(0, undefined))(pi);

    expect(tools.filter((tool) => tool.name === "request_input")).toEqual([]);
  });

  it("gives only request_input to a child", () => {
    const { pi, tools } = fakePi();
    createExtension(deps(1, mkdtempSync(join(tmpdir(), "pi-herdr-run-"))))(pi);

    expect(tools.map((tool) => tool.name)).toEqual(["request_input"]);
  });

  it("registers nothing in a child without a run directory", () => {
    const { pi, tools } = fakePi();
    createExtension(deps(1, undefined))(pi);

    expect(tools).toEqual([]);
  });
});
