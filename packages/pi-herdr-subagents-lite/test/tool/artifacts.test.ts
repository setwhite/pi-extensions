import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { fakeHost } from "../support/host.ts";
import { artifactOf } from "../support/paths.ts";
import { eventually, longResult, parseStarted } from "../support/result.ts";
import { runTask } from "../support/run.ts";
import { loadSession } from "../support/session.ts";
import { settleTurn } from "../support/turn.ts";
import "../support/hooks.ts";

function session() {
  process.env.HERDR_ENV = "1";
  return loadSession(fakeHost().host);
}

it("truncates a long turn and writes the artifact", async () => {
  const { sent, tool } = session();
  const { head, full } = longResult();
  const started = parseStarted(await runTask(tool, "long report"));
  settleTurn(started.sessionFile, { text: full });
  await eventually(() => sent.length === 1);

  const content = sent[0]?.message.content ?? "";
  expect(content).toContain(head);
  expect(content).toContain("Full result:");
  expect(readFileSync(artifactOf(started.sessionFile, 1), "utf8")).toBe(full);
});

it("does not split surrogate pairs when truncating", async () => {
  const { sent, tool } = session();
  const started = parseStarted(await runTask(tool, "emoji report"));
  const text = `${"h".repeat(16383)}😀${"z".repeat(100)}`;
  settleTurn(started.sessionFile, { text });
  await eventually(() => sent.length === 1);

  const content = sent[0]?.message.content ?? "";
  expect(content).toContain("h".repeat(16383));
  expect(content).toContain("Full result:");
  expect(content).not.toMatch(/\p{Cs}/u);
  expect(readFileSync(artifactOf(started.sessionFile, 1), "utf8")).toContain("😀");
});

it("does not write an artifact for a short turn", async () => {
  const { sent, tool } = session();
  const started = parseStarted(await runTask(tool, "short report"));
  settleTurn(started.sessionFile, { text: "short answer" });
  await eventually(() => sent.length === 1);

  expect(sent[0]?.message.content).toContain("short answer");
  expect(sent[0]?.message.content).not.toContain("Full result:");
});

it("delivers the same text again in a new turn", async () => {
  const { sent, tool } = session();
  const started = parseStarted(await runTask(tool, "repeat"));
  settleTurn(started.sessionFile, { text: "same" });
  await eventually(() => sent.length === 1);
  settleTurn(started.sessionFile, { text: "same" });
  await eventually(() => sent.length === 2);

  expect(sent[1]?.message.content).toContain("same");
});

it("delivers a done turn without text", async () => {
  const { sent, tool } = session();
  const started = parseStarted(await runTask(tool, "silent"));
  settleTurn(started.sessionFile);
  await eventually(() => sent.length === 1);

  expect(sent[0]?.message.content).toBe("[subagent worker-1] done\n\n");
});
