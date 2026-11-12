import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { createInbox, enqueue } from "../inbox/index.ts";
import { spawnFailed, ToolError } from "./errors.ts";
import { findAgent } from "./find.ts";
import { createPane } from "./pane.ts";
import { resolveProfile, resolveSkills } from "./resolve.ts";
import { requireSlot } from "./slot.ts";
import { agentArgs } from "./spawn-args.ts";
import type { RunRecord, RunState } from "./state.ts";
import { watchRun } from "./watch.ts";

export interface SentResult {
  state: "sent";
  name: string;
}

export interface RestartedResult {
  state: "restarted";
  name: string;
  paneId: string;
}

export type SendResult = SentResult | RestartedResult;

function inboxMessage(text: string): string {
  return `[from parent]\n\n${text}\n`;
}

export async function send(state: RunState, name: string, message: string): Promise<SendResult> {
  const run = state.runs.find((candidate) => candidate.name === name);
  if (!run) {
    const names = state.available();
    const list = names.length === 0 ? "none" : names.join(", ");
    throw new ToolError("unknown_agent", `unknown agent "${name}"; available: ${list}`);
  }
  if (state.stopped) {
    throw new ToolError("spawn_failed", "the session is shutting down");
  }

  if (run.phase === "running") {
    await enqueue(run.runBase, inboxMessage(message));
    return { state: "sent", name };
  }
  // pane 已关的 idle 不用再查 agent，直接重启。
  if (run.phase === "idle" && !run.paneClosed) {
    const agent = findAgent(await state.host.listAgents(), run);
    if (agent) {
      run.absentChecks = 0;
      run.phase = "running";
      watchRun(state, run);
      await enqueue(run.runBase, inboxMessage(message));
      return { state: "sent", name };
    }
  }
  return resume(state, run, message);
}

async function resume(state: RunState, run: RunRecord, message: string): Promise<SendResult> {
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
  requireSlot(state);
  const cwd = run.cwd;
  const skillPaths = await resolveSkills(profile, cwd, state.trusted);
  const identityFile = `${run.runBase}.identity.md`;
  const previousPaneId = run.pane?.paneId;
  run.autoExit = profile.autoExit;

  if (run.pane !== undefined && !(await state.host.hasPane(run.pane.paneId))) {
    run.pane = undefined;
  }

  try {
    const pane = run.pane ?? (await createPane(state, run, cwd, run.paneLabel || run.name));
    run.pane = pane;
    run.paneClosed = false;
    if (profile.systemPrompt !== "task") {
      await writeFile(identityFile, profile.body, "utf8");
    }
    createInbox(run.runBase);
    await state.host.startAgent({
      name: run.name,
      paneId: pane.paneId,
      sessionFile: run.sessionFile,
      agentArgs: agentArgs(profile, identityFile, state.toolName, skillPaths),
    });
  } catch (error) {
    run.phase = "dead";
    throw spawnFailed(error, run.pane?.paneId, run.pane?.paneId !== previousPaneId);
  }

  run.phase = "running";
  run.absentChecks = 0;
  watchRun(state, run);
  await enqueue(run.runBase, inboxMessage(message));
  return { state: "restarted", name: run.name, paneId: run.pane.paneId };
}
