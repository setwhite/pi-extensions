import { mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type TurnOutcome = "done" | "error" | "aborted" | "quit";

export interface Turn {
  turn: number;
  outcome: TurnOutcome;
  stopReason: string;
  errorMessage?: string;
  text?: string;
  children: number;
  at: number;
}

export interface TurnInput {
  stopReason: string | undefined;
  pendingToolCall: boolean;
  aborted: boolean;
  errorMessage?: string;
}

export interface TurnVerdict {
  outcome: TurnOutcome;
  errorMessage?: string;
}

export interface TurnEntry {
  type?: string;
  message?: {
    role?: string;
    content?: unknown;
    stopReason?: string;
    errorMessage?: string;
  };
}

export interface TurnSlice {
  found: boolean;
  stopReason: string | undefined;
  errorMessage: string | undefined;
  pendingToolCall: boolean;
  text: string | null;
}

const OUTCOMES: ReadonlySet<string> = new Set(["done", "error", "aborted", "quit"]);
const TRUNCATED = "答案在输出上限处被截断，不是完整结果。";
const NO_MESSAGE = "这一轮以错误结束，没有错误信息。";
const TURN_FILE = /^\d{6}\.json$/;

function textOf(content: unknown): string | null {
  if (!Array.isArray(content)) {
    return null;
  }
  const text = content
    .filter((block): block is { type: "text"; text: string } => {
      if (typeof block !== "object" || block === null) {
        return false;
      }
      const candidate = block as { type?: unknown; text?: unknown };
      return candidate.type === "text" && typeof candidate.text === "string";
    })
    .map((block) => block.text)
    .filter((line) => line.trim() !== "")
    .join("\n")
    .trim();
  return text === "" ? null : text;
}

function hasToolCall(content: unknown): boolean {
  if (!Array.isArray(content)) {
    return false;
  }
  return content.some((block) => {
    if (typeof block !== "object" || block === null) {
      return false;
    }
    const candidate = block as { type?: unknown; name?: unknown };
    return candidate.type === "toolCall" && typeof candidate.name === "string";
  });
}

// 只取最后一条 user 消息之后的内容：/tree、压缩、重启都不能把旧答案算进这一轮。
export function lastTurnOf(entries: TurnEntry[]): TurnSlice {
  let start = 0;
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry?.type === "message" && entry.message?.role === "user") {
      start = index + 1;
      break;
    }
  }
  for (let index = entries.length - 1; index >= start; index -= 1) {
    const entry = entries[index];
    if (entry?.type !== "message" || entry.message?.role !== "assistant") {
      continue;
    }
    const content = entry.message.content;
    return {
      found: true,
      stopReason: entry.message.stopReason,
      errorMessage: entry.message.errorMessage,
      pendingToolCall: hasToolCall(content),
      text: textOf(content),
    };
  }
  return { found: false, stopReason: undefined, errorMessage: undefined, pendingToolCall: false, text: null };
}

// 只判定这一轮怎么结束，不判定子代理之后该干什么。
export function classifyTurn(input: TurnInput): TurnVerdict {
  if (input.aborted || input.pendingToolCall) {
    return { outcome: "aborted" };
  }
  switch (input.stopReason) {
    case undefined:
    case "stop":
      return { outcome: "done" };
    case "aborted":
    case "toolUse":
      return { outcome: "aborted" };
    case "length":
      return { outcome: "error", errorMessage: TRUNCATED };
    case "error":
      return { outcome: "error", errorMessage: input.errorMessage ?? NO_MESSAGE };
    default:
      return { outcome: "error", errorMessage: `这一轮的结束原因未识别：${input.stopReason}。` };
  }
}

export function turnsDir(runBase: string): string {
  return `${runBase}.turns`;
}

export function turnFile(runBase: string, turn: number): string {
  return join(turnsDir(runBase), `${String(turn).padStart(6, "0")}.json`);
}

function writeAtomic(file: string, text: string): void {
  mkdirSync(dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  writeFileSync(temp, text);
  renameSync(temp, file);
}

export function writeTurn(runBase: string, turn: Turn): string {
  const file = turnFile(runBase, turn.turn);
  writeAtomic(file, JSON.stringify(turn));
  return file;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function readTurn(file: string): Turn | null {
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }
  const turn = parsed as Partial<Turn>;
  if (
    typeof turn.turn !== "number" ||
    typeof turn.stopReason !== "string" ||
    typeof turn.children !== "number" ||
    typeof turn.at !== "number" ||
    typeof turn.outcome !== "string" ||
    !OUTCOMES.has(turn.outcome)
  ) {
    return null;
  }
  const errorMessage = optionalString(turn.errorMessage);
  const text = optionalString(turn.text);
  return {
    turn: turn.turn,
    outcome: turn.outcome as TurnOutcome,
    stopReason: turn.stopReason,
    children: turn.children,
    at: turn.at,
    ...(errorMessage === undefined ? {} : { errorMessage }),
    ...(text === undefined ? {} : { text }),
  };
}

export function listTurns(runBase: string): string[] {
  let names: string[];
  try {
    names = readdirSync(turnsDir(runBase));
  } catch {
    return [];
  }
  return names
    .filter((name) => TURN_FILE.test(name))
    .sort()
    .map((name) => join(turnsDir(runBase), name));
}

export function removeTurn(file: string): void {
  try {
    unlinkSync(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}

// 子代理是唯一写入者，所以不需要锁。
export function nextTurn(runBase: string): number {
  const file = `${runBase}.turn`;
  let current = 0;
  try {
    const parsed = Number.parseInt(readFileSync(file, "utf8").trim(), 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      current = parsed;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
  const next = current + 1;
  writeAtomic(file, String(next));
  return next;
}
