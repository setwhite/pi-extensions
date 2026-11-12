import { writeFileSync } from "node:fs";
import { expect, it } from "vitest";
import { readSessionTail } from "../../src/session-file/index.ts";
import { message, tempFile } from "../support/session-file-fixture.ts";

function padding(count: number): string[] {
  const filler = "x".repeat(64 * 1024);
  return Array.from({ length: count }, () => message("user", [{ type: "text", text: filler }]));
}

it("reports a clean tail", () => {
  const file = tempFile();
  writeFileSync(file, `${message("assistant", [{ type: "text", text: "done" }])}\n`);
  expect(readSessionTail(file)).toEqual({ pendingToolCall: false, unreadable: false });
});

it("reports a turn that stopped on a tool call", () => {
  const file = tempFile();
  writeFileSync(
    file,
    `${message("assistant", [{ type: "toolCall", id: "call-1", name: "ask_user_question", arguments: {} }])}\n`,
  );
  expect(readSessionTail(file)).toEqual({ pendingToolCall: true, unreadable: false });
});

it("skips unparsable lines", () => {
  const file = tempFile();
  writeFileSync(file, `not json\n${message("assistant", [{ type: "toolCall", id: "call-1", name: "ask" }])}\n`);
  expect(readSessionTail(file)).toEqual({ pendingToolCall: true, unreadable: false });
});

it("reports a missing file as unreadable", () => {
  expect(readSessionTail(`${tempFile()}.missing`)).toEqual({ pendingToolCall: false, unreadable: true });
});

it("finds the last assistant outside the tail window", () => {
  const file = tempFile();
  writeFileSync(
    file,
    [message("assistant", [{ type: "toolCall", id: "call-1", name: "ask" }]), ...padding(20)].join("\n"),
  );
  expect(readSessionTail(file)).toEqual({ pendingToolCall: true, unreadable: false });
});
