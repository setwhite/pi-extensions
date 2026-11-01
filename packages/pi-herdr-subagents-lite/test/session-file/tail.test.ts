import { readFileSync, statSync, writeFileSync } from "node:fs";
import { expect, it } from "vitest";
import { readLastAssistant } from "../../src/session-file/index.ts";
import { message, tempFile } from "../support/session-file-fixture.ts";

const TAIL_WINDOW = 1024 * 1024;

function line(value: string): Buffer {
  return Buffer.from(`${value}\n`, "utf8");
}

function largeSession(lines: string[]): string {
  const file = tempFile();
  writeFileSync(file, `${lines.join("\n")}\n`);
  return file;
}

function padding(count: number): string[] {
  const filler = "x".repeat(64 * 1024);
  return Array.from({ length: count }, () => message("user", [{ type: "text", text: filler }]));
}

it("reads the last assistant message from the tail window of a large session file", () => {
  const file = largeSession([
    message("assistant", [{ type: "text", text: "first" }]),
    ...padding(20),
    message("assistant", [{ type: "text", text: "last" }]),
  ]);

  expect(statSync(file).size).toBeGreaterThan(TAIL_WINDOW);
  expect(readLastAssistant(file)).toEqual({ text: "last", pendingToolCall: false, empty: false, unreadable: false });
});

it("reads a large session file when the only assistant message is outside the window", () => {
  const file = largeSession([message("assistant", [{ type: "text", text: "at the start" }]), ...padding(20)]);

  expect(statSync(file).size).toBeGreaterThan(TAIL_WINDOW);
  expect(readLastAssistant(file)).toEqual({
    text: "at the start",
    pendingToolCall: false,
    empty: false,
    unreadable: false,
  });
});

it("keeps text intact when the tail window starts inside a multi-byte character", () => {
  const head = line(message("assistant", [{ type: "text", text: "start" }]));
  const probe = line(message("user", [{ type: "text", text: "中" }]));
  const runStart = probe.indexOf("中");
  const runSuffix = probe.length - runStart - Buffer.byteLength("中");
  let text = "尾部文本";
  let tail = line(message("assistant", [{ type: "text", text }]));
  let chars = 0;
  let boundaryOffset = 0;
  for (;;) {
    const offset = runSuffix + tail.length - TAIL_WINDOW;
    chars = Math.ceil((1 - offset) / 3);
    boundaryOffset = 3 * chars + offset;
    if (boundaryOffset >= 1 && boundaryOffset % 3 !== 0) {
      break;
    }
    text += "!";
    tail = line(message("assistant", [{ type: "text", text }]));
  }

  const body = line(message("user", [{ type: "text", text: "中".repeat(chars) }]));
  const file = tempFile();
  writeFileSync(file, Buffer.concat([head, body, tail]));

  const bytes = readFileSync(file);
  const boundary = bytes.length - TAIL_WINDOW;
  expect(boundary).toBeGreaterThanOrEqual(head.length + runStart);
  expect((bytes[boundary] ?? 0) & 0xc0).toBe(0x80);
  expect(readLastAssistant(file)).toEqual({ text, pendingToolCall: false, empty: false, unreadable: false });
});
