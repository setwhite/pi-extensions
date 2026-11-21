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

export const OUTCOMES: ReadonlySet<string> = new Set(["done", "error", "aborted", "quit"]);
const TRUNCATED = "The answer was truncated at the output limit and is incomplete.";
const NO_MESSAGE = "The turn ended with an error and no error message.";

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
      return { outcome: "error", errorMessage: `Unrecognized stop reason: ${input.stopReason}.` };
  }
}
