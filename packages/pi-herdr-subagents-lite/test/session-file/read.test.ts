import { mkdirSync, writeFileSync } from "node:fs";
import { expect, it } from "vitest";
import { readLastAssistant } from "../../src/session-file/index.ts";
import { message, tempFile } from "../support/session-file-fixture.ts";

interface SessionCase {
  name: string;
  lines?: string[];
  directory?: boolean;
  expected: { text: string | null; pendingToolCall: boolean; empty: boolean; unreadable: boolean };
}

const cases: SessionCase[] = [
  {
    name: "returns the last assistant text",
    lines: [
      message("assistant", [{ type: "text", text: "first" }]),
      message("assistant", [{ type: "text", text: "second" }]),
    ],
    expected: { text: "second", pendingToolCall: false, empty: false, unreadable: false },
  },
  {
    name: "joins multiple text blocks with newlines",
    lines: [
      message("assistant", [
        { type: "text", text: "First block." },
        { type: "thinking", thinking: "hidden" },
        { type: "text", text: "Second block." },
      ]),
    ],
    expected: { text: "First block.\nSecond block.", pendingToolCall: false, empty: false, unreadable: false },
  },
  {
    name: "skips malformed lines",
    lines: [message("assistant", [{ type: "text", text: "kept" }]), "{not json"],
    expected: { text: "kept", pendingToolCall: false, empty: false, unreadable: false },
  },
  {
    name: "returns null when the last assistant has no text",
    lines: [
      message("assistant", [{ type: "text", text: "earlier" }]),
      message("assistant", [{ type: "thinking", thinking: "only thinking" }]),
    ],
    expected: { text: null, pendingToolCall: false, empty: false, unreadable: false },
  },
  {
    name: "marks a missing file as unreadable",
    expected: { text: null, pendingToolCall: false, empty: false, unreadable: true },
  },
  {
    name: "marks a directory as unreadable",
    directory: true,
    expected: { text: null, pendingToolCall: false, empty: false, unreadable: true },
  },
  {
    name: "is empty when no assistant message is written yet",
    lines: [message("user", [{ type: "text", text: "# Task" }])],
    expected: { text: null, pendingToolCall: false, empty: true, unreadable: false },
  },
  {
    name: "marks a trailing tool call as pending",
    lines: [
      message("assistant", [
        { type: "text", text: "Need a decision." },
        { type: "thinking", thinking: "waiting" },
        { type: "toolCall", id: "call-1", name: "ask_user_question", arguments: {} },
      ]),
    ],
    expected: {
      text: "Need a decision.",
      pendingToolCall: true,
      empty: false,
      unreadable: false,
    },
  },
  {
    name: "marks a tool-only assistant message as pending",
    lines: [message("assistant", [{ type: "toolCall", id: "call-1", name: "ask_user_question", arguments: {} }])],
    expected: {
      text: null,
      pendingToolCall: true,
      empty: false,
      unreadable: false,
    },
  },
];

it.each(cases)("$name", ({ lines, directory, expected }) => {
  const file = tempFile();
  if (lines) {
    writeFileSync(file, `${lines.join("\n")}\n`);
  }
  if (directory) {
    mkdirSync(file);
  }

  expect(readLastAssistant(file)).toEqual(expected);
});
