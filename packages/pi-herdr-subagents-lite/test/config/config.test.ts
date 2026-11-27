import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { dataDir, loadConfig, runsDir } from "../../src/config/index.ts";

function agentDirWith(value: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "pi-herdr-config-"));
  if (value !== undefined) {
    mkdirSync(dataDir(dir), { recursive: true });
    writeFileSync(join(dataDir(dir), "config.json"), JSON.stringify(value));
  }
  return dir;
}

describe("loadConfig", () => {
  it("falls back to the documented defaults", () => {
    expect(loadConfig(agentDirWith(undefined))).toEqual({
      enabled: true,
      toolName: "subagent",
      excludeTools: ["ask"],
      maxConcurrent: 16,
      summaryMaxChars: 2000,
      aggregateWindowMs: 500,
      interruptGraceMs: 3000,
      closeChildrenOn: ["quit", "reload"],
      runRetentionMs: 2592000000,
    });
  });

  it("keeps valid overrides", () => {
    const dir = agentDirWith({ maxConcurrent: 3, toolName: "helper", closeChildrenOn: ["quit"] });
    const config = loadConfig(dir);

    expect(config.maxConcurrent).toBe(3);
    expect(config.toolName).toBe("helper");
    expect(config.closeChildrenOn).toEqual(["quit"]);
  });

  it("accepts a custom excludeTools list", () => {
    expect(loadConfig(agentDirWith({ excludeTools: ["ask", "todo"] })).excludeTools).toEqual(["ask", "todo"]);
  });

  it("accepts an empty excludeTools list", () => {
    expect(loadConfig(agentDirWith({ excludeTools: [] })).excludeTools).toEqual([]);
  });

  it("rejects an excludeTools entry that is not a non-empty string", () => {
    expect(() => loadConfig(agentDirWith({ excludeTools: ["ask", ""] }))).toThrow(
      /excludeTools: expected a non-empty string/,
    );
    expect(() => loadConfig(agentDirWith({ excludeTools: [1] }))).toThrow(/excludeTools/);
  });

  it("rejects excludeTools that is not an array", () => {
    expect(() => loadConfig(agentDirWith({ excludeTools: "ask" }))).toThrow(/excludeTools: expected array/);
  });

  it("names an unknown key", () => {
    expect(() => loadConfig(agentDirWith({ maxResultChars: 100 }))).toThrow(/maxResultChars: unknown key/);
  });

  it("rejects a toolName that breaks the pattern", () => {
    expect(() => loadConfig(agentDirWith({ toolName: "Sub Agent" }))).toThrow(/toolName/);
  });

  it("rejects an out of range integer", () => {
    expect(() => loadConfig(agentDirWith({ maxConcurrent: 0 }))).toThrow(/maxConcurrent/);
  });

  it("rejects an unknown shutdown reason", () => {
    expect(() => loadConfig(agentDirWith({ closeChildrenOn: ["quit", "explode"] }))).toThrow(/explode/);
  });

  it("rejects invalid JSON", () => {
    const dir = agentDirWith(undefined);
    mkdirSync(dataDir(dir), { recursive: true });
    writeFileSync(join(dataDir(dir), "config.json"), "{");

    expect(() => loadConfig(dir)).toThrow(/not valid JSON/);
  });
});

describe("paths", () => {
  it("keeps runs under the package directory", () => {
    expect(runsDir("/agent")).toBe(join("/agent", "pi-herdr-subagents-lite", "runs"));
  });
});
