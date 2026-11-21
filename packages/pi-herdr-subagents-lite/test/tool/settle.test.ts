import { expect, it } from "vitest";
import { fakeHost } from "../support/host.ts";
import { eventually, flushDelivery, parseStarted } from "../support/result.ts";
import { runTask } from "../support/run.ts";
import { loadSession } from "../support/session.ts";
import { settleTurn } from "../support/turn.ts";
import "../support/hooks.ts";

it("reports a quit turn from a running child and closes its pane", async () => {
  process.env.HERDR_ENV = "1";
  const fake = fakeHost();
  const { sent, tool } = loadSession(fake.host);
  const started = parseStarted(await runTask(tool, "quit soon"));
  settleTurn(started.sessionFile, { outcome: "quit", stopReason: "quit" });
  await eventually(() => fake.calls.includes("closePane"));

  expect(sent[0]?.message.content).toContain("stopped before reporting a result");
});

it("ignores a quit turn that arrives after the run is already idle", async () => {
  process.env.HERDR_ENV = "1";
  const fake = fakeHost();
  const { sent, tool } = loadSession(fake.host);
  const started = parseStarted(await runTask(tool, "say hello"));
  settleTurn(started.sessionFile, { text: "hello" });
  await flushDelivery(sent);

  settleTurn(started.sessionFile, { outcome: "quit", stopReason: "quit" });
  await eventually(() => fake.calls.includes("closePane"));

  expect(sent).toHaveLength(1);
});
