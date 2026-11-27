export const ID_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/;

export type RunStatus = "starting" | "running" | "interrupting" | "needs_input" | "done" | "failed" | "cancelled";

const SLOTTED: readonly RunStatus[] = ["starting", "running", "interrupting"];

const TRANSITIONS: Record<RunStatus, readonly RunStatus[]> = {
  starting: ["running", "failed", "cancelled"],
  running: ["interrupting", "needs_input", "done", "failed", "cancelled"],
  interrupting: ["running", "failed", "cancelled"],
  needs_input: ["running", "failed", "cancelled"],
  done: ["running", "cancelled"],
  failed: ["running", "cancelled"],
  cancelled: [],
};

export function occupiesSlot(status: RunStatus): boolean {
  return SLOTTED.includes(status);
}

export function isActive(status: RunStatus): boolean {
  return occupiesSlot(status);
}

export function canTransition(from: RunStatus, to: RunStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export type StartVerdict = "ok" | "invalid_id" | "duplicate_id" | "max_concurrent";

export interface StartCheck {
  id: string;
  existingIds: string[];
  slottedCount: number;
  maxConcurrent: number;
}

export function checkStart(check: StartCheck): StartVerdict {
  if (!ID_PATTERN.test(check.id)) {
    return "invalid_id";
  }
  if (check.existingIds.includes(check.id)) {
    return "duplicate_id";
  }
  if (check.slottedCount >= check.maxConcurrent) {
    return "max_concurrent";
  }
  return "ok";
}

export function truncateSummary(value: string, limit: number): { summary: string; truncated: boolean } {
  if (value.length <= limit) {
    return { summary: value, truncated: false };
  }
  return { summary: value.slice(0, limit), truncated: true };
}
