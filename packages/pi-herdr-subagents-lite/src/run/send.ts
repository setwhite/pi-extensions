import { enqueue } from "../inbox/index.ts";
import { cancelled, shouldCancel, ToolError } from "./errors.ts";
import { findAgent } from "./find.ts";
import { type RestartedResult, resume } from "./resume.ts";
import type { RunRecord, RunState } from "./state.ts";
import { watchRun } from "./watch.ts";

export interface SentResult {
  state: "sent";
  name: string;
}

export type { RestartedResult };
export type SendResult = SentResult | RestartedResult;

function inboxMessage(text: string): string {
  return `[from parent]\n\n${text}\n`;
}

// 重启也进 pending：会话收尾要等它落地，否则可能在建完 pane 之后才关。
function trackPending<T>(state: RunState, work: Promise<T>): Promise<T> {
  state.pending.add(work);
  const done = () => state.pending.delete(work);
  work.then(done, done);
  return work;
}

export async function send(state: RunState, name: string, message: string, signal?: AbortSignal): Promise<SendResult> {
  const run = state.runs.find((candidate) => candidate.name === name);
  if (!run) {
    const names = state.available();
    const list = names.length === 0 ? "none" : names.join(", ");
    throw new ToolError("unknown_agent", `unknown agent "${name}"; available: ${list}`);
  }
  if (shouldCancel(state, signal)) {
    throw cancelled();
  }
  if (run.phase === "starting") {
    throw new ToolError("spawn_failed", `"${run.name}" is still starting; retry once it is running`);
  }
  if (run.phase === "running") {
    enqueue(run.runBase, inboxMessage(message));
    return { state: "sent", name };
  }
  return trackPending(state, sendInactive(state, run, message, signal));
}

async function sendInactive(
  state: RunState,
  run: RunRecord,
  message: string,
  signal: AbortSignal | undefined,
): Promise<SendResult> {
  const previousPhase = run.phase;
  // 先占位再 await：并行进来的第二个 send 必须看到 starting 并让路。
  run.phase = "starting";
  // pane 已关的 idle 不用再查 agent，直接重启。
  if (previousPhase === "idle" && !run.paneClosed) {
    let agent: ReturnType<typeof findAgent>;
    try {
      agent = findAgent(await state.host.listAgents(signal === undefined ? undefined : { signal }), run);
    } catch (error) {
      run.phase = previousPhase;
      throw error;
    }
    if (shouldCancel(state, signal)) {
      run.phase = previousPhase;
      throw cancelled();
    }
    if (agent) {
      run.absentChecks = 0;
      run.phase = "running";
      watchRun(state, run);
      enqueue(run.runBase, inboxMessage(message));
      return { state: "sent", name: run.name };
    }
  }
  return resume(state, run, inboxMessage(message), previousPhase, signal);
}
