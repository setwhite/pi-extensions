import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { createInbox, enqueue } from "../inbox/index.ts";
import type { Profile } from "../profile/index.ts";
import { cancelled, shouldCancel, spawnFailed, ToolError } from "./errors.ts";
import { createPane } from "./pane.ts";
import { resolveProfile, resolveSkills } from "./resolve.ts";
import { requireSlot } from "./slot.ts";
import { agentArgs } from "./spawn-args.ts";
import type { RunPane, RunRecord, RunState } from "./state.ts";
import { watchRun } from "./watch.ts";

export interface RestartedResult {
  state: "restarted";
  name: string;
  paneId: string;
}

async function prepareResume(state: RunState, run: RunRecord, signal: AbortSignal | undefined) {
  if (!existsSync(run.sessionFile)) {
    throw new ToolError("session_missing", `"${run.name}" has no child session to resume; start a new run`);
  }
  const tail = state.readSessionTail(run.sessionFile);
  if (tail.unreadable) {
    throw new ToolError("session_unreadable", `"${run.name}" has a child session that cannot be read; start a new run`);
  }
  if (tail.pendingToolCall) {
    throw new ToolError(
      "tail_dirty",
      `"${run.name}" cannot restart: its session ends with an unfinished tool call. Wait for the child to finish, or start a new run.`,
    );
  }
  const profile = resolveProfile(state.loadProfiles(), run.profileName);
  requireSlot(state, run.name);
  const skillPaths = await resolveSkills(profile, run.cwd, state.trusted);
  if (shouldCancel(state, signal)) {
    throw cancelled();
  }
  return { profile, skillPaths };
}

async function restartOrFail(
  state: RunState,
  run: RunRecord,
  profile: Profile,
  skillPaths: string[] | undefined,
  previousPaneId: string | undefined,
  signal: AbortSignal | undefined,
): Promise<RunPane> {
  const call = signal === undefined ? undefined : { signal };
  const identityFile = `${run.runBase}.identity.md`;
  try {
    if (run.pane !== undefined && !(await state.host.hasPane(run.pane.paneId, call))) {
      run.pane = undefined;
    }
    if (shouldCancel(state, signal)) {
      throw cancelled();
    }
    const pane = run.pane ?? (await createPane(state, run, run.cwd, run.paneLabel || run.name, signal));
    run.pane = pane;
    run.paneClosed = false;
    if (shouldCancel(state, signal)) {
      throw cancelled();
    }
    if (profile.systemPrompt !== "task") {
      await writeFile(identityFile, profile.body, "utf8");
    }
    createInbox(run.runBase);
    await state.host.startAgent(
      {
        name: run.name,
        paneId: pane.paneId,
        sessionFile: run.sessionFile,
        agentArgs: agentArgs(profile, identityFile, state.toolName, skillPaths),
      },
      call,
    );
    return pane;
  } catch (error) {
    const createdNewPane = run.pane !== undefined && run.pane.paneId !== previousPaneId;
    if (shouldCancel(state, signal) && createdNewPane && run.pane !== undefined) {
      await state.host.closePane(run.pane.paneId).catch(() => undefined);
      run.paneClosed = true;
    }
    run.phase = "dead";
    if (error instanceof ToolError) {
      throw error;
    }
    throw spawnFailed(error, run.pane?.paneId, createdNewPane);
  }
}

export async function resume(
  state: RunState,
  run: RunRecord,
  inboxText: string,
  previousPhase: RunRecord["phase"],
  signal: AbortSignal | undefined,
): Promise<RestartedResult> {
  let prepared: Awaited<ReturnType<typeof prepareResume>>;
  try {
    prepared = await prepareResume(state, run, signal);
  } catch (error) {
    run.phase = previousPhase;
    throw error;
  }

  const previousPaneId = run.pane?.paneId;
  run.autoExit = prepared.profile.autoExit;
  const pane = await restartOrFail(state, run, prepared.profile, prepared.skillPaths, previousPaneId, signal);

  run.phase = "running";
  run.absentChecks = 0;
  watchRun(state, run);
  enqueue(run.runBase, inboxText);
  return { state: "restarted", name: run.name, paneId: pane.paneId };
}
