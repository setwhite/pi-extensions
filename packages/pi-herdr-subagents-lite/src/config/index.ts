import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BLOCKED_KINDS,
  BRIDGE_KEYS,
  boolean,
  CONFIG_KEYS,
  enumList,
  integer,
  isRaw,
  nonEmptyString,
  object,
  optionalString,
  PROMPT_KEYS,
  type Raw,
  type Scope,
  SHUTDOWN_REASONS,
  stringArray,
  toolName,
  unknownKeys,
} from "./schema.ts";

export { isRaw, type Raw } from "./schema.ts";

export type BlockedKind = (typeof BLOCKED_KINDS)[number];
export type ShutdownReason = (typeof SHUTDOWN_REASONS)[number];

interface PromptOverrides {
  description?: string;
  snippet?: string;
  guidelines?: string[];
}

export interface Config {
  enabled: boolean;
  toolName: string;
  herdrBin: string;
  maxConcurrent: number;
  maxResultChars: number;
  aggregateWindowMs: number;
  closeChildrenOn: ShutdownReason[];
  inboxPollMs: number;
  pollIntervalMs: number;
  idlePollIntervalMs: number;
  prompts: PromptOverrides;
  bridge: { enabled: boolean; blockedOn: BlockedKind[] };
}

function promptOverrides(scope: Scope): PromptOverrides {
  const prompts = object(scope, "prompts", PROMPT_KEYS);
  const overrides: PromptOverrides = {};
  for (const key of ["description", "snippet"] as const) {
    const line = optionalString(prompts, key);
    if (line !== undefined) {
      overrides[key] = line;
    }
  }
  const guidelines = stringArray(prompts, "guidelines");
  if (guidelines !== undefined) {
    overrides.guidelines = guidelines;
  }
  return overrides;
}

function parse(raw: Raw, file: string): Config {
  const problems: string[] = [];
  const top: Scope = { raw, prefix: "", problems };
  unknownKeys(top, CONFIG_KEYS);
  const bridge = object(top, "bridge", BRIDGE_KEYS);

  const config: Config = {
    enabled: boolean(top, "enabled", true),
    toolName: toolName(top),
    herdrBin: nonEmptyString(top, "herdrBin", "herdr"),
    maxConcurrent: integer(top, "maxConcurrent", 16, 1, Number.POSITIVE_INFINITY),
    maxResultChars: integer(top, "maxResultChars", 16384, 1024, 1048576),
    aggregateWindowMs: integer(top, "aggregateWindowMs", 500, 0, 10000),
    closeChildrenOn: enumList(top, "closeChildrenOn", SHUTDOWN_REASONS, []),
    inboxPollMs: integer(top, "inboxPollMs", 250, 50, 5000),
    pollIntervalMs: integer(top, "pollIntervalMs", 1000, 100, 60000),
    idlePollIntervalMs: integer(top, "idlePollIntervalMs", 8000, 100, 60000),
    prompts: promptOverrides(top),
    bridge: {
      enabled: boolean(bridge, "enabled", true),
      blockedOn: enumList(bridge, "blockedOn", BLOCKED_KINDS, BLOCKED_KINDS),
    },
  };

  if (problems.length > 0) {
    throw new Error(`invalid config ${file}: ${problems.join("; ")}`);
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

export function dataDir(agentDir: string): string {
  return join(agentDir, "pi-herdr-subagents-lite");
}

export function loadConfig(agentDir: string): Config {
  const file = join(dataDir(agentDir), "config.json");
  return parse(readRaw(file), file);
}
