import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { createInbox, enqueue } from "../inbox/index.ts";
import { closeTab } from "./close.ts";
import { spawnFailed, ToolError } from "./errors.ts";
import { findAgent } from "./find.ts";
import { createPane } from "./pane.ts";
import { wake } from "./poll.ts";
import { resolveProfile, resolveSkills } from "./resolve.ts";
import { requireSlot } from "./slot.ts";
import { agentArgs } from "./spawn-args.ts";
import type { RunState } from "./state.ts";

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

  const agent = findAgent(await state.host.listAgents(), run);
  if (agent) {
    if (!run.live) {
      requireSlot(state);
      run.lastHandledSeq = agent.completionSeq;
      run.live = true;
      run.pollFailures = 0;
    }
    wake(state);
    await enqueue(run.sessionFile, inboxMessage(message));
    return { state: "sent", name };
  }

  if (!existsSync(run.sessionFile)) {
    throw new ToolError("session_missing", `child session "${run.sessionFile}" is missing; start a new run`);
  }
  const tail = state.readLastAssistant(run.sessionFile);
  if (tail.unreadable) {
    throw new ToolError("session_unreadable", `child session "${run.sessionFile}" cannot be read; start a new run`);
  }
  if (tail.pendingToolCall) {
    throw new ToolError(
      "tail_dirty",
      `"${name}" cannot restart: its session ends with an unfinished tool call. Wait for the child to finish, or start a new run.`,
    );
  }

  const profile = resolveProfile(state.loadProfiles(), run.profileName);
  requireSlot(state);
  const cwd = run.cwd;
  const skillPaths = await resolveSkills(profile, cwd, state.trusted);
  const identityFile = `${run.sessionFile}.identity.md`;
  const previousPaneId = run.pane?.paneId;
  const envChanged = run.autoExit !== profile.autoExit;
  run.autoExit = profile.autoExit;

  if (run.pane) {
    const paneAlive = await state.host.hasPane(run.pane.paneId);
    if (!paneAlive) {
      run.pane = undefined;
    } else if (envChanged) {
      try {
        await closeTab(state, run);
      } catch (error) {
        throw spawnFailed(error, previousPaneId, false);
      }
      run.pane = undefined;
    }
  }

  run.read = undefined;
  try {
    const pane = run.pane ?? (await createPane(state, run, cwd, run.paneLabel || run.name));
    run.pane = pane;
    if (profile.systemPrompt !== "task") {
      await writeFile(identityFile, profile.body, "utf8");
    }
    createInbox(run.sessionFile);
    await state.host.startAgent({
      name: run.name,
      paneId: pane.paneId,
      sessionFile: run.sessionFile,
      agentArgs: agentArgs(profile, identityFile, state.toolName, skillPaths),
    });
    const baseline = findAgent(await state.host.listAgents(), run);
    if (!baseline) {
      throw new Error(`agent "${run.name}" did not register after resume`);
    }
    run.lastHandledSeq = baseline.completionSeq;
  } catch (error) {
    state.settle(run);
    throw spawnFailed(error, run.pane?.paneId, run.pane?.paneId !== previousPaneId);
  }

  run.live = true;
  run.pollFailures = 0;
  run.busy = false;
  run.absentSince = undefined;
  wake(state);
  await enqueue(run.sessionFile, inboxMessage(message));
  return { state: "restarted", name: run.name, paneId: run.pane.paneId };
}
