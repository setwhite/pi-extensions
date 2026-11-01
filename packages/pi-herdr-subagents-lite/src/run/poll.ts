import type { AgentEntry } from "../herdr/index.ts";
import { findAgent } from "./find.ts";
import { exited, readResult, recordFailure } from "./poll-result.ts";
import type { RunRecord, RunState } from "./state.ts";

const ACTIVITY_WINDOW_MS = 30_000;
const BUSY_STATUSES = new Set(["working", "blocked", "unknown"]);
// 被杀死的子代理既不写回执，pane 也不会消失：这是唯一需要时限的死亡判定。
const LOST_CHILD_MS = 10_000;

// 不排 0 延迟：首拍太早只会多一次 list。
export function wake(state: RunState): void {
  state.activeUntil = state.now() + ACTIVITY_WINDOW_MS;
  reschedule(state, state.pollIntervalMs);
}

export function stopPoll(state: RunState): void {
  if (state.pollTimer !== undefined) {
    clearTimeout(state.pollTimer);
    state.pollTimer = undefined;
  }
}

function reschedule(state: RunState, delayMs: number): void {
  stopPoll(state);
  if (state.stopped) {
    return;
  }
  state.pollTimer = setTimeout(() => void tick(state), delayMs);
  state.pollTimer.unref?.();
}

// 只读 state：投递链抛错时也要能排出下一拍。
function plan(state: RunState): number | undefined {
  const live = state.runs.filter((run) => run.live);
  if (live.length === 0) {
    return undefined;
  }
  const now = state.now();
  let retry: number | undefined;
  for (const run of live) {
    if (run.read === undefined) {
      continue;
    }
    const delay = Math.max(0, run.read.at - now);
    retry = retry === undefined ? delay : Math.min(retry, delay);
  }
  if (retry !== undefined) {
    return retry;
  }
  const busy = now < state.activeUntil || live.some((run) => run.absentSince !== undefined || run.busy);
  return busy ? state.pollIntervalMs : state.idlePollIntervalMs;
}

async function tick(state: RunState): Promise<void> {
  state.pollTimer = undefined;
  state.pollBusy = true;
  try {
    await pollRuns(state);
  } finally {
    state.pollBusy = false;
    const delay = plan(state);
    if (delay !== undefined) {
      reschedule(state, delay);
    }
  }
}

async function pollRun(state: RunState, agents: AgentEntry[], run: RunRecord): Promise<void> {
  const agent = findAgent(agents, run);
  if (!agent) {
    await missing(state, run);
    return;
  }
  run.busy = BUSY_STATUSES.has(agent.status);
  run.absentSince = undefined;
  run.pollFailures = 0;
  if (run.read !== undefined) {
    if (state.now() < run.read.at) {
      return;
    }
    await readResult(state, run, Math.max(run.read.seq, agent.completionSeq), run.read.attempt + 1);
    return;
  }
  if (agent.completionSeq > run.lastHandledSeq && (agent.status === "idle" || agent.status === "done")) {
    await readResult(state, run, agent.completionSeq, 1);
  }
}

// 死亡只认事实：回执，或 pane 消失。
async function missing(state: RunState, run: RunRecord): Promise<void> {
  const receipt = state.readExitReceipt(run.sessionFile);
  if (receipt !== null) {
    await exited(state, run, receipt);
    return;
  }
  if (run.pane === undefined || !(await state.host.hasPane(run.pane.paneId))) {
    await exited(state, run, null);
    return;
  }
  run.absentSince ??= state.now();
  if (state.now() - run.absentSince >= LOST_CHILD_MS) {
    await exited(state, run, null);
  }
}

async function pollRuns(state: RunState): Promise<void> {
  let agents: AgentEntry[];
  try {
    agents = await state.host.listAgents();
  } catch {
    for (const run of [...state.runs]) {
      await recordFailure(state, run);
    }
    return;
  }
  for (const run of [...state.runs]) {
    if (!run.live) {
      continue;
    }
    try {
      await pollRun(state, agents, run);
    } catch {
      await recordFailure(state, run);
    }
  }
}
