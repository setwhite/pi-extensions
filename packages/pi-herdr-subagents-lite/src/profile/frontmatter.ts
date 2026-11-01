import type { Raw } from "../config/index.ts";

export const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
export const SYSTEM_PROMPT_MODES = ["append", "replace", "task"] as const;

export type Thinking = (typeof THINKING_LEVELS)[number];
export type SystemPromptMode = (typeof SYSTEM_PROMPT_MODES)[number];

export interface Profile {
  name: string;
  description: string;
  body: string;
  model: string | undefined;
  thinking: Thinking | undefined;
  tools: string | undefined;
  skills: string[] | undefined;
  systemPrompt: SystemPromptMode;
  autoExit: boolean;
  disableModelInvocation: boolean;
}

export interface ProfileProblem {
  name: string;
  file: string;
  field: string;
  reason: string;
}

export interface Fields {
  raw: Raw;
  name: string;
  file: string;
  problems: ProfileProblem[];
}

function typeName(value: unknown): string {
  if (Array.isArray(value)) {
    return "array";
  }
  if (value === null) {
    return "null";
  }
  return typeof value;
}

function complain(fields: Fields, field: string, reason: string) {
  fields.problems.push({ name: fields.name, file: fields.file, field, reason });
}

export function nameField(fields: Fields): string | undefined {
  const value = fields.raw.name;
  if (value === undefined) {
    complain(fields, "name", "required");
    return undefined;
  }
  if (typeof value !== "string") {
    complain(fields, "name", `expected string, got ${typeName(value)}`);
    return undefined;
  }
  const name = value.trim();
  if (name === "") {
    complain(fields, "name", "expected a non-empty name");
    return undefined;
  }
  return name;
}

export function stringField(fields: Fields, key: string): string | undefined {
  const value = fields.raw[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    complain(fields, key, `expected string, got ${typeName(value)}`);
    return undefined;
  }
  return value;
}

export function enumField<T extends string>(fields: Fields, key: string, allowed: readonly T[]): T | undefined {
  const value = stringField(fields, key);
  if (value === undefined) {
    return undefined;
  }
  if ((allowed as readonly string[]).includes(value)) {
    return value as T;
  }
  complain(fields, key, `expected one of ${allowed.join(", ")}`);
  return undefined;
}

export function booleanField(fields: Fields, key: string): boolean | undefined {
  const value = fields.raw[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    complain(fields, key, `expected boolean, got ${typeName(value)}`);
    return undefined;
  }
  return value;
}

export function toolsField(fields: Fields): string | undefined {
  const value = stringField(fields, "tools");
  if (value === undefined || value === "") {
    return value;
  }
  const entries = value.split(",").map((entry) => entry.trim());
  const signed = entries.filter((entry) => entry.startsWith("+") || entry.startsWith("-"));
  const broken = entries.some((entry) => entry === "" || entry === "+" || entry === "-");
  if (broken || (signed.length > 0 && signed.length < entries.length)) {
    complain(fields, "tools", "expected names, or +name/-name entries, not both");
    return undefined;
  }
  return value;
}

export function skillsField(fields: Fields): string[] | undefined {
  const value = fields.raw.skills;
  if (value === undefined) {
    return undefined;
  }
  if (value === "") {
    return [];
  }
  const names = typeof value === "string" ? [value] : value;
  if (!Array.isArray(names) || !names.every((name) => typeof name === "string")) {
    complain(fields, "skills", "expected a name or a list of names");
    return undefined;
  }
  const named = names as string[];
  if (named.some((name) => name === "" || name.startsWith("+") || name.startsWith("-"))) {
    complain(fields, "skills", "expected names without +/- prefixes");
    return undefined;
  }
  return named;
}
