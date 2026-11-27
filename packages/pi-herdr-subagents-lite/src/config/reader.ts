import { SHUTDOWN_REASONS, type ShutdownReason } from "./types.ts";

const TOOL_NAME = /^[a-z][a-z0-9_]{0,31}$/;

export type Raw = Record<string, unknown>;

export function isRaw(value: unknown): value is Raw {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class Reader {
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

  excludeTools(): string[] {
    const value = this.raw.excludeTools;
    if (value === undefined) {
      return ["ask"];
    }
    if (!Array.isArray(value)) {
      this.problems.push("excludeTools: expected array");
      return ["ask"];
    }
    const picked: string[] = [];
    for (const item of value) {
      if (typeof item === "string" && item.trim() !== "") {
        picked.push(item);
      } else {
        this.problems.push(`excludeTools: expected a non-empty string, got ${JSON.stringify(item)}`);
      }
    }
    return picked;
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
