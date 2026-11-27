import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const SHUTDOWN_REASONS = ["new", "resume", "fork", "quit", "reload"] as const;
export type ShutdownReason = (typeof SHUTDOWN_REASONS)[number];

export const CONFIG_KEYS = [
  "enabled",
  "toolName",
  "maxConcurrent",
  "summaryMaxChars",
  "aggregateWindowMs",
  "interruptGraceMs",
  "closeChildrenOn",
  "runRetentionMs",
] as const;

export interface Config {
  enabled: boolean;
  toolName: string;
  maxConcurrent: number;
  summaryMaxChars: number;
  aggregateWindowMs: number;
  interruptGraceMs: number;
  closeChildrenOn: ShutdownReason[];
  runRetentionMs: number;
}

const TOOL_NAME = /^[a-z][a-z0-9_]{0,31}$/;
const DAY_MS = 86_400_000;

export function agentDir(): string {
  return process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
}

export function dataDir(agentDirectory: string): string {
  return join(agentDirectory, "pi-herdr-subagents-lite");
}

export function runsDir(agentDirectory: string): string {
  return join(dataDir(agentDirectory), "runs");
}

type Raw = Record<string, unknown>;

function isRaw(value: unknown): value is Raw {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

class Reader {
  readonly problems: string[] = [];
  readonly raw: Raw;

  constructor(raw: Raw) {
    this.raw = raw;
  }

  unknownKeys(known: readonly string[]): void {
    for (const key of Object.keys(this.raw)) {
      if (!known.includes(key)) {
        this.problems.push(`${key}: unknown key`);
      }
    }
  }

  boolean(key: string, fallback: boolean): boolean {
    const value = this.raw[key];
    if (value === undefined) {
      return fallback;
    }
    if (typeof value !== "boolean") {
      this.problems.push(`${key}: expected boolean`);
      return fallback;
    }
    return value;
  }

  integer(key: string, fallback: number, min: number, max: number): number {
    const value = this.raw[key];
    if (value === undefined) {
      return fallback;
    }
    if (typeof value !== "number" || !Number.isInteger(value)) {
      this.problems.push(`${key}: expected integer`);
      return fallback;
    }
    if (value < min || value > max) {
      this.problems.push(`${key}: expected ${min}..${max}`);
      return fallback;
    }
    return value;
  }

  toolName(): string {
    const value = this.raw.toolName;
    if (value === undefined) {
      return "subagent";
    }
    if (typeof value !== "string" || !TOOL_NAME.test(value)) {
      this.problems.push(`toolName: expected a name matching ${TOOL_NAME.source}`);
      return "subagent";
    }
    return value;
  }

  reasons(): ShutdownReason[] {
    const value = this.raw.closeChildrenOn;
    if (value === undefined) {
      return ["quit", "reload"];
    }
    if (!Array.isArray(value)) {
      this.problems.push("closeChildrenOn: expected array");
      return ["quit", "reload"];
    }
    const picked: ShutdownReason[] = [];
    for (const item of value) {
      if (typeof item === "string" && (SHUTDOWN_REASONS as readonly string[]).includes(item)) {
        picked.push(item as ShutdownReason);
      } else {
        this.problems.push(`closeChildrenOn: unknown value ${JSON.stringify(item)}`);
      }
    }
    return picked;
  }
}

function parse(raw: Raw, file: string): Config {
  const reader = new Reader(raw);
  reader.unknownKeys(CONFIG_KEYS);
  const config: Config = {
    enabled: reader.boolean("enabled", true),
    toolName: reader.toolName(),
    maxConcurrent: reader.integer("maxConcurrent", 8, 1, 64),
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

export function configFile(agentDirectory: string): string {
  return join(dataDir(agentDirectory), "config.json");
}

export function loadConfig(agentDirectory: string): Config {
  const file = configFile(agentDirectory);
  return parse(readRaw(file), file);
}
