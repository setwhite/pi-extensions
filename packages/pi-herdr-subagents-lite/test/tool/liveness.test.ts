import { expect, it, vi } from "vitest";
import { fakeHost } from "../support/host.ts";
import { parseStarted } from "../support/result.ts";
import { runTask } from "../support/run.ts";
import { loadSession } from "../support/session.ts";
import "../support/hooks.ts";

it("counts one absence per poll even when listAgents is slower than the interval", async () => {
  process.env.HERDR_ENV = "1";
  vi.useFakeTimers();
  const fake = fakeHost();
  const { sent, tool } = loadSession(fake.host);
  parseStarted(await runTask(tool, "long task"));

  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let polls = 0;
  fake.setListAgents(async () => {
    polls += 1;
    if (polls === 1) {
      await gate;
    }
    return [];
  });

  // 45 秒 = 三拍。第一拍卡住，后两拍必须被跳过，否则缺席会被记成三次。
  await vi.advanceTimersByTimeAsync(45_000);
  expect(polls).toBe(1);
  release();
  await vi.advanceTimersByTimeAsync(0);
  expect(sent).toHaveLength(0);

  await vi.advanceTimersByTimeAsync(30_000);
  await vi.advanceTimersByTimeAsync(600);

  expect(sent[0]?.message.content).toContain("lost contact");
});
