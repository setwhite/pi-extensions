import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { cancelled, shouldCancel, spawnFailed, ToolError } from "./errors.ts";
import { paneLabel } from "./naming.ts";
import { createPane } from "./pane.ts";
import { runFiles, runsDir } from "./paths.ts";
import { resolveProfile, resolveSkills } from "./resolve.ts";
import { startAgentWithRetry } from "./retry.ts";
import { requireSlot } from "./slot.ts";
import { resolveCwd } from "./spawn-args.ts";
import type { RunRecord, RunState } from "./state.ts";
import { watchRun } from "./watch.ts";

export interface RunStarted {
  state: "running";
  name: string;
  paneId: string;
  sessionFile: string;
}

export function start(
  state: RunState,
  profileName: string,
  task: string,
  rawCwd?: string,
  signal?: AbortSignal,
): Promise<RunStarted> {
  const work = launch(state, profileName, task, rawCwd, signal);
  state.pending.add(work);
  const settle = () => state.pending.delete(work);
  work.then(settle, settle);
  return work;
}

async function launch(
  state: RunState,
  profileName: string,
  task: string,
  rawCwd: string | undefined,
  signal: AbortSignal | undefined,
): Promise<RunStarted> {
  if (shouldCancel(state, signal)) {
    throw cancelled();
  }
  const profile = resolveProfile(state.loadProfiles(), profileName);
  requireSlot(state);

  const runId = randomUUID();
  const files = (name: string) => runFiles(state.sessionsDir, name, runId);
  const name = state.nextName(profileName);
  const first = files(name);
  const cwd = resolveCwd(rawCwd);
  const run: RunRecord = {
    name,
    profileName: profile.name,
    pane: undefined,
    paneLabel: "",
    sessionFile: first.sessionFile,
    runBase: first.runBase,
    cwd,
    autoExit: profile.autoExit,
    lastTurn: 0,
    artifactSeq: 0,
    phase: "starting",
    absentChecks: 0,
    paneClosed: false,
    deliveryFailures: 0,
  };
  // 先占槽再 await：并发的 run() 必须立刻看到它。
  state.runs.push(run);

  try {
    const skillPaths = await resolveSkills(profile, cwd, state.trusted);
    run.paneLabel = paneLabel(task) || run.name;
    const pane = await createPane(state, run, cwd, run.paneLabel, signal);
    run.pane = pane;
    await mkdir(state.sessionsDir, { recursive: true });
    await mkdir(runsDir(), { recursive: true });
    await startAgentWithRetry(state, run, { profile, task, pane, files, skillPaths, signal });

    watchRun(state, run);
    run.phase = "running";

    return { state: "running", name: run.name, paneId: pane.paneId, sessionFile: run.sessionFile };
  } catch (error) {
    const pane = run.pane;
    state.release(run);
    if (shouldCancel(state, signal) && pane) {
      // 清理失败不改变结论：run 已被取消。
      await state.host.closePane(pane.paneId).catch(() => undefined);
    }
    if (error instanceof ToolError) {
      throw error;
    }
    throw spawnFailed(error, pane?.paneId);
  }
}
