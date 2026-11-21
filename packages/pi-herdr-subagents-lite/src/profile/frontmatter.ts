import type { Raw } from "../config/index.ts";

// 未知字段报错：拼错 auto_exit 会静默退回默认值，用户看不到任何反馈（DEC-0069）。
export const PROFILE_KEYS: ReadonlySet<string> = new Set([
  "name",
  "description",
  "model",
  "thinking",
  "tools",
  "skills",
  "system-prompt",
  "auto-exit",
  "disable-model-invocation",
]);
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

export function typeName(value: unknown): string {
  if (Array.isArray(value)) {
    return "array";
  }
  if (value === null) {
    return "null";
  }
  return typeof value;
}

export function complain(fields: Fields, field: string, reason: string) {
  fields.problems.push({ name: fields.name, file: fields.file, field, reason });
}

export function unknownFields(fields: Fields): void {
  for (const key of Object.keys(fields.raw)) {
    if (!PROFILE_KEYS.has(key)) {
      complain(fields, key, "unknown field");
    }
  }
}
