import { readFileSync } from "node:fs";
import { configFile } from "./paths.ts";
import { isRaw, type Raw, Reader } from "./reader.ts";
import { CONFIG_KEYS, type Config } from "./types.ts";

export { agentDir, configFile, dataDir, runsDir, sessionsDir } from "./paths.ts";
export type { Config, ShutdownReason } from "./types.ts";
export { CONFIG_KEYS, SHUTDOWN_REASONS } from "./types.ts";

const DAY_MS = 86_400_000;

function parse(raw: Raw, file: string): Config {
  const reader = new Reader(raw);
  reader.unknownKeys(CONFIG_KEYS);
  const config: Config = {
    enabled: reader.boolean("enabled", true),
    toolName: reader.toolName(),
    excludeTools: reader.excludeTools(),
    maxConcurrent: reader.integer("maxConcurrent", 16, 1, 64),
    summaryMaxChars: reader.integer("summaryMaxChars", 2000, 200, 100_000),
    aggregateWindowMs: reader.integer("aggregateWindowMs", 500, 0, 10_000),
    interruptGraceMs: reader.integer("interruptGraceMs", 3000, 100, 60_000),
    closeChildrenOn: reader.reasons(),
    runRetentionMs: reader.integer("runRetentionMs", 30 * DAY_MS, 0, 365 * DAY_MS),
  };
  if (reader.problems.length > 0) {
    throw new Error(`invalid config ${file}: ${reader.problems.join("; ")}`);
  }
  return config;
}

function readRaw(file: string): Raw {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`invalid config ${file}: not valid JSON`);
  }
  if (!isRaw(parsed)) {
    throw new Error(`invalid config ${file}: expected a JSON object`);
  }
  return parsed;
}

export function loadConfig(agentDirectory: string): Config {
  const file = configFile(agentDirectory);
  return parse(readRaw(file), file);
}
