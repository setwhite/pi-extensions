export const CONFIG_KEYS = [
  "enabled",
  "toolName",
  "herdrBin",
  "maxConcurrent",
  "maxResultChars",
  "aggregateWindowMs",
  "closeChildrenOn",
  "inboxPollMs",
  "pollIntervalMs",
  "idlePollIntervalMs",
  "prompts",
  "bridge",
];
export const BRIDGE_KEYS = ["enabled", "blockedOn"];
export const PROMPT_KEYS = ["description", "snippet", "guidelines"];
export const BLOCKED_KINDS = ["custom", "select", "confirm", "input", "editor"] as const;
export const SHUTDOWN_REASONS = ["new", "resume", "fork", "quit", "reload"] as const;
const TOOL_NAME = /^[a-z][a-z0-9_]{0,31}$/;

export type Raw = Record<string, unknown>;

export interface Scope {
  raw: Raw;
  prefix: string;
  problems: string[];
}

export function isRaw(value: unknown): value is Raw {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function object(scope: Scope, key: string, known: string[]): Scope {
  const value = scope.raw[key];
  if (value !== undefined && !isRaw(value)) {
    scope.problems.push(`${scope.prefix}${key}: expected object`);
  }
  const nested: Scope = { raw: isRaw(value) ? value : {}, prefix: `${scope.prefix}${key}.`, problems: scope.problems };
  unknownKeys(nested, known);
  return nested;
}

export function unknownKeys(scope: Scope, known: string[]): void {
  for (const key of Object.keys(scope.raw)) {
    if (!known.includes(key)) {
      scope.problems.push(`${scope.prefix}${key}: unknown key`);
    }
  }
}

export function integer(scope: Scope, key: string, fallback: number, min: number, max: number): number {
  const value = scope.raw[key];
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== "number" || !Number.isInteger(value)) {
    scope.problems.push(`${scope.prefix}${key}: expected integer`);
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
}

export function boolean(scope: Scope, key: string, fallback: boolean): boolean {
  const value = scope.raw[key];
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== "boolean") {
    scope.problems.push(`${scope.prefix}${key}: expected boolean`);
    return fallback;
  }
  return value;
}

export function optionalString(scope: Scope, key: string): string | undefined {
  const value = scope.raw[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    scope.problems.push(`${scope.prefix}${key}: expected string`);
    return undefined;
  }
  return value;
}

export function stringArray(scope: Scope, key: string): string[] | undefined {
  const value = scope.raw[key];
  if (value === undefined) {
    return undefined;
  }
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return value as string[];
  }
  scope.problems.push(`${scope.prefix}${key}: expected string array`);
  return undefined;
}

export function nonEmptyString(scope: Scope, key: string, fallback: string): string {
  const value = optionalString(scope, key);
  if (value === undefined) {
    return fallback;
  }
  if (value.trim() === "") {
    scope.problems.push(`${scope.prefix}${key}: expected a non-empty string`);
    return fallback;
  }
  return value;
}

export function toolName(scope: Scope): string {
  const value = optionalString(scope, "toolName");
  if (value === undefined) {
    return "subagent";
  }
  if (!TOOL_NAME.test(value)) {
    scope.problems.push(`toolName: expected a name matching ${TOOL_NAME.source}`);
    return "subagent";
  }
  return value;
}

export function enumList<T extends string>(
  scope: Scope,
  key: string,
  allowed: readonly T[],
  fallback: readonly T[],
): T[] {
  const value = scope.raw[key];
  if (value === undefined) {
    return [...fallback];
  }
  if (!Array.isArray(value)) {
    scope.problems.push(`${scope.prefix}${key}: expected array`);
    return [...fallback];
  }
  const items: T[] = [];
  for (const item of value) {
    if (typeof item === "string" && (allowed as readonly string[]).includes(item)) {
      items.push(item as T);
    } else {
      scope.problems.push(
        `${scope.prefix}${key}: unknown value ${JSON.stringify(item)}; allowed: ${allowed.join(", ")}`,
      );
    }
  }
  return items;
}
