import { expect } from "vitest";
import type { RunStarted } from "../../src/run/index.ts";

export function firstText(result: { content: Array<{ type: string; text?: string }> }): string {
  const block = result.content[0];
  if (block?.type !== "text" || block.text === undefined) {
    throw new Error("expected text content");
  }
  return block.text;
}

export function parseStarted(result: { content: Array<{ type: string; text?: string }> }): RunStarted {
  return JSON.parse(firstText(result)) as RunStarted;
}

export function assistantLine(text: string): string {
  return JSON.stringify({
    type: "message",
    message: { role: "assistant", content: [{ type: "text", text }] },
  });
}

export function longResult() {
  const head = "h".repeat(16384);
  return { head, full: `${head}TAIL_MARKER` };
}

function askLine(args: unknown): string {
  return JSON.stringify({
    type: "message",
    message: {
      role: "assistant",
      content: [
        { type: "text", text: "Need a decision." },
        { type: "toolCall", id: "call-1", name: "ask_user_question", arguments: args },
      ],
    },
  });
}

export function pendingAskLine(): string {
  return askLine({});
}

const realSetTimeout = setTimeout;

export async function flushDelivery<T>(items: T[], count = 1): Promise<void> {
  for (let attempt = 0; attempt < 400 && items.length < count; attempt += 1) {
    await new Promise((resolve) => realSetTimeout(resolve, 5));
  }
  expect(items).toHaveLength(count);
}
