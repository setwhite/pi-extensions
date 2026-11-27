import type { Config } from "../../src/config/index.ts";

export function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    enabled: true,
    toolName: "subagent",
    excludeTools: ["ask"],
    maxConcurrent: 16,
    summaryMaxChars: 2000,
    aggregateWindowMs: 0,
    interruptGraceMs: 50,
    closeChildrenOn: ["quit", "reload"],
    runRetentionMs: 0,
    ...overrides,
  };
}
