import { mkdirSync, writeFileSync } from "node:fs";
import { expect, it } from "vitest";
import { readExitReceipt } from "../../src/session-file/index.ts";
import { tempFile } from "../support/session-file-fixture.ts";

it("reads an exit receipt", () => {
  const file = tempFile();
  writeFileSync(`${file}.exit`, JSON.stringify({ reason: "quit" }));

  expect(readExitReceipt(file)).toEqual({ reason: "quit" });
});

it("returns null when the exit receipt is missing", () => {
  expect(readExitReceipt(tempFile())).toBeNull();
});

it("returns null when the exit receipt is malformed", () => {
  const file = tempFile();
  writeFileSync(`${file}.exit`, "{not json");

  expect(readExitReceipt(file)).toBeNull();
});

it("throws when the exit receipt cannot be read", () => {
  const file = tempFile();
  mkdirSync(`${file}.exit`);

  expect(() => readExitReceipt(file)).toThrow();
});
