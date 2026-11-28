// 用例 2：子代理调用 request_input 落盘，父侧按 seq 读出问题，并核对子进程 argv 与 env 透传。
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readChildResult } from "../../src/run/index.ts";
import { useE2e } from "./fixture.ts";
import { prereqs } from "./prereq.ts";
import { waitFor } from "./process.ts";

const state = prereqs();

interface ProcessInfo {
  process_info: { foreground_processes: Array<{ argv?: string[]; argv0?: string }> };
}

describe.skipIf(!state.ok)(`e2e: request_input loop${state.ok ? "" : ` (skipped: ${state.reason})`}`, () => {
  const e2e = useE2e();

  it("surfaces the child's questions without a dialog", async () => {
    const env = e2e();
    const id = `asking-${Date.now().toString(36)}`;
    const spawned = await env.service.spawn({
      id,
      objective:
        "Call the request_input tool exactly once with questions: [{question: 'Which branch should I use?', options: ['main', 'next']}]. Then end the turn without doing anything else.",
    });

    // 真机上 herdr 只在 agent.get 里推进 managed agent 的启动状态：先轮询再 prompt，顺序不能反。
    const started = env.calls.indexOf("startAgent");
    const polled = env.calls.indexOf("getAgent");
    const prompted = env.calls.indexOf("prompt");
    expect(started).toBeGreaterThanOrEqual(0);
    expect(polled).toBeGreaterThan(started);
    expect(prompted).toBeGreaterThan(polled);

    const envelope = await waitFor(
      () => env.envelopes().find((entry) => entry.id === id),
      "needs_input envelope",
      180_000,
    );

    expect(envelope.status).toBe("needs_input");
    expect(envelope.questions?.[0]?.question).toMatch(/branch/i);
    expect(envelope.questions?.[0]?.options).toEqual(["main", "next"]);

    const result = await readChildResult(join(env.runsDir, id));
    expect(result?.state).toBe("needs_input");
    expect(result?.seq).toBeGreaterThanOrEqual(1);
    // 会话与产物分家：产物在 runs，子会话在 sessions，父代理拿到的路径到不了后者。
    expect(existsSync(join(env.sessionsDir, id, "session.jsonl"))).toBe(true);
    expect(existsSync(join(env.runsDir, id, "session.jsonl"))).toBe(false);

    // env 透传：只有拿到 PI_SUBAGENT_RUN_DIR，子进程才写得进这个目录；PI_SUBAGENT_DEPTH=1 才注册 request_input。
    expect(envelope.status).toBe("needs_input");

    const info = (await env.call("pane.process_info", { pane_id: spawned.paneId })) as ProcessInfo;
    const child = info.process_info.foreground_processes.find((process) =>
      /(^|[\\/])pi(\.exe|cmd)?$/.test(process.argv0 ?? ""),
    );
    expect(child).toBeDefined();
    const argv = child?.argv ?? [];
    expect(argv).toContain("--session");
    expect(argv).toContain(join(env.sessionsDir, id, "session.jsonl"));
    const excludeAt = argv.indexOf("--exclude-tools");
    expect(excludeAt).toBeGreaterThanOrEqual(0);
    expect(argv[excludeAt + 1]).toBe("ask");
  }, 240_000);
});
