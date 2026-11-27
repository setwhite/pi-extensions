import { HerdrError } from "../herdr/index.ts";
import { childEnv } from "./args.ts";
import { errorText } from "./errors.ts";
import type { RunRecord, RunState } from "./state.ts";

/** 关掉过 pane 的 run 再续跑时重开一个 pane，沿用原 session 与启动参数。 */
export async function ensurePane(state: RunState, record: RunRecord): Promise<void> {
  if (record.paneId !== undefined) {
    return;
  }
  const base = {
    cwd: record.worktree?.path ?? record.cwd,
    label: record.id,
    env: childEnv({ id: record.id, runDir: record.runDir }),
  };
  const paneId = await state.client.createTab(
    record.worktree === undefined ? base : { ...base, workspaceId: record.worktree.workspaceId },
  );
  record.paneId = paneId;
  await state.client.startAgent({ name: record.id, paneId, args: record.args });
}

const NOT_READY_BUDGET_MS = 30_000;
const NOT_READY_PAUSE_MS = 250;

/** 刚起的 agent 要等 herdr 把它认成这个 pane 的具名 agent；在那之前 prompt 回 agent_not_ready。 */
export async function promptWhenReady(state: RunState, target: string, message: string): Promise<void> {
  const deadline = state.now() + NOT_READY_BUDGET_MS;
  for (;;) {
    try {
      await state.client.prompt(target, message);
      return;
    } catch (error) {
      const starting = error instanceof HerdrError && error.code === "agent_not_ready";
      if (!starting || state.now() >= deadline) {
        throw error;
      }
      await state.delay(NOT_READY_PAUSE_MS);
    }
  }
}

export async function closePaneOf(state: RunState, record: RunRecord): Promise<void> {
  const paneId = record.paneId;
  if (paneId === undefined) {
    return;
  }
  record.paneId = undefined;
  try {
    await state.client.closePane(paneId);
  } catch (error) {
    state.onProblem(`${record.id}: pane close failed: ${errorText(error)}`);
  }
}
