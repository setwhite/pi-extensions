import { mkdirSync } from "node:fs";
import { basename } from "node:path";
import { errorText } from "../error/index.ts";
import { listTurns, readTurn, turnsDir } from "../turn/index.ts";
import { findAgent } from "./find.ts";
import { runsDir } from "./paths.ts";
import { pruneRuns } from "./prune.ts";
import { settleLost, settleTurn } from "./settle.ts";
import type { RunRecord, RunState } from "./state.ts";

// 500ms 一次 readdir：没有进程启动，也没有 fs.watch 在 Windows 上的断言崩溃。
const SCAN_MS = 500;
const LOST_CHECKS = 3;

export function startWatch(state: RunState): void {
  const runs = runsDir();
  mkdirSync(runs, { recursive: true });
  pruneRuns(
    runs,
    state.runRetentionMs,
    state.now(),
    state.runs.map((run) => basename(run.runBase)),
  );
  state.scanTimer = setInterval(() => void scan(state).catch((error) => state.onProblem(errorText(error))), SCAN_MS);
  state.scanTimer.unref?.();
  state.livenessTimer = setInterval(
    () => void checkLiveness(state).catch((error) => state.onProblem(errorText(error))),
    state.livenessPollMs,
  );
  state.livenessTimer.unref?.();
}

export function stopWatch(state: RunState): void {
  if (state.scanTimer !== undefined) {
    clearInterval(state.scanTimer);
    state.scanTimer = undefined;
  }
  if (state.livenessTimer !== undefined) {
    clearInterval(state.livenessTimer);
    state.livenessTimer = undefined;
  }
}

export function watchRun(_state: RunState, run: RunRecord): void {
  mkdirSync(turnsDir(run.runBase), { recursive: true });
}

async function scan(state: RunState): Promise<void> {
  if (state.scanning) {
    state.scanAgain = true;
    return;
  }
  state.scanning = true;
  try {
    for (const run of [...state.runs]) {
      if (run.phase === "closed") {
        continue;
      }
      for (const file of listTurns(run.runBase)) {
        const turn = readTurn(file);
        if (turn === null) {
          continue;
        }
        await settleTurn(state, run, file, turn);
      }
    }
  } finally {
    state.scanning = false;
    if (state.scanAgain) {
      state.scanAgain = false;
      await scan(state);
    }
  }
}

async function checkLiveness(state: RunState): Promise<void> {
  // listAgents 慢于轮询间隔时不能叠加：叠加会把 absentChecks 多记一遍，三次就误判 lost。
  if (state.checkingLiveness) {
    return;
  }
  const running = state.runs.filter((run) => run.phase === "running");
  if (running.length === 0) {
    return;
  }
  state.checkingLiveness = true;
  try {
    let agents: Awaited<ReturnType<RunState["host"]["listAgents"]>>;
    try {
      agents = await state.host.listAgents();
    } catch {
      return;
    }
    for (const run of running) {
      if (run.phase !== "running") {
        continue;
      }
      if (findAgent(agents, run)) {
        run.absentChecks = 0;
        continue;
      }
      if (run.pane === undefined || !(await state.host.hasPane(run.pane.paneId))) {
        await settleLost(state, run);
        continue;
      }
      run.absentChecks += 1;
      if (run.absentChecks >= LOST_CHECKS) {
        await settleLost(state, run);
      }
    }
  } finally {
    state.checkingLiveness = false;
  }
}
