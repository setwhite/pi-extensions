import { childArgs, childEnv, promptText, resolveCwd } from "./args.ts";
import { errorText, ToolError } from "./errors.ts";
import { closePaneOf, promptWhenReady } from "./pane.ts";
import { ensureRunDir, runDirOf, sessionFileOf } from "./paths.ts";
import { checkStart, type RunStatus, type StartVerdict } from "./rules.ts";
import { type RunRecord, type RunState, slottedCount } from "./state.ts";
import { watch } from "./watch.ts";

export interface SpawnInput {
  id: string;
  objective: string;
  context?: string;
  cwd?: string;
  worktree?: boolean;
  tools?: string[];
  skills?: string[];
  model?: string;
  thinking?: string;
}

export interface Spawned {
  id: string;
  status: RunStatus;
  paneId: string;
  sessionFile: string;
  worktree?: string;
}

function startError(verdict: Exclude<StartVerdict, "ok">, id: string, state: RunState): ToolError {
  if (verdict === "invalid_id") {
    return new ToolError("invalid_id", `"${id}" must match ^[a-z][a-z0-9_-]{0,31}$`);
  }
  if (verdict === "duplicate_id") {
    return new ToolError("duplicate_id", `a run named "${id}" already exists in this session`);
  }
  return new ToolError("max_concurrent", `${state.maxConcurrent} runs are already active; wait or stop one`);
}

/** 建 worktree 后，在该 workspace 里另开一个带 env 的 pane，关掉原来的空 shell。 */
async function prepareWorktree(state: RunState, record: RunRecord): Promise<void> {
  const created = await state.client.createWorktree({ cwd: record.cwd, label: record.id });
  record.worktree = { workspaceId: created.workspaceId, path: created.path };
  const paneId = await state.client.splitPane({
    paneId: created.paneId,
    cwd: created.path,
    env: childEnv({ id: record.id, runDir: record.runDir }),
  });
  record.paneId = paneId;
  await state.client.closePane(created.paneId);
}

async function rollback(state: RunState, record: RunRecord): Promise<void> {
  record.status = "cancelled";
  await closePaneOf(state, record);
  if (record.worktree !== undefined) {
    const workspaceId = record.worktree.workspaceId;
    record.worktree = undefined;
    try {
      await state.client.removeWorktree(workspaceId);
    } catch (error) {
      state.onProblem(`${record.id}: worktree rollback failed: ${errorText(error)}`);
    }
  }
  state.runs.delete(record.id);
}

export async function spawn(state: RunState, input: SpawnInput): Promise<Spawned> {
  const verdict = checkStart({
    id: input.id,
    existingIds: [...state.runs.keys()],
    slottedCount: slottedCount(state.runs.values()),
    maxConcurrent: state.maxConcurrent,
  });
  if (verdict !== "ok") {
    throw startError(verdict, input.id, state);
  }

  const cwd = resolveCwd(input.cwd);
  const runDir = runDirOf(state.runsDir, input.id);
  const sessionFile = sessionFileOf(runDir);
  const args = childArgs({
    sessionFile,
    ...(input.tools === undefined ? {} : { tools: input.tools }),
    ...(input.skills === undefined ? {} : { skills: input.skills }),
    ...(input.model === undefined ? {} : { model: input.model }),
    ...(input.thinking === undefined ? {} : { thinking: input.thinking }),
  });
  const record: RunRecord = {
    id: input.id,
    status: "starting",
    paneId: undefined,
    sessionFile,
    runDir,
    cwd,
    args,
    worktree: undefined,
    seq: 0,
    pendingSteer: undefined,
    graceTimer: undefined,
    generation: 0,
  };
  state.runs.set(record.id, record);

  try {
    await ensureRunDir(runDir);
    if (input.worktree === true) {
      await prepareWorktree(state, record);
    } else {
      record.paneId = await state.client.createTab({ cwd, label: record.id, env: childEnv({ id: record.id, runDir }) });
    }
    const paneId = record.paneId;
    if (paneId === undefined) {
      throw new Error("no pane was created");
    }
    await state.client.startAgent({ name: record.id, paneId, args });
    await promptWhenReady(state, paneId, promptText(input.objective, input.context));
    record.status = "running";
    watch(state, record);
    const spawned: Spawned = { id: record.id, status: "running", paneId, sessionFile };
    if (record.worktree !== undefined) {
      spawned.worktree = record.worktree.path;
    }
    return spawned;
  } catch (error) {
    const paneId = record.paneId;
    await rollback(state, record);
    const detail = `${errorText(error)}${paneId === undefined ? "" : `. Pane: ${paneId}`}`;
    throw new ToolError("spawn_failed", detail);
  }
}
