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

const READY_BUDGET_MS = 30_000;
const READY_POLL_MS = 100;

function isStarting(error: unknown): boolean {
  return error instanceof HerdrError && (error.code === "agent_not_ready" || error.code === "agent_not_found");
}

/**
 * 等 herdr 把这个 pane 的 agent 标成 interactive_ready。
 * 必须用 agent.get 轮询：只有它的 handler 会推进启动状态，agent.list 与 agent.prompt 都不会，
 * 不轮询的话 agent.start 会一直停在 launch pending，prompt 回 agent_not_ready 直到超时。
 */
async function awaitAgentReady(state: RunState, target: string, deadline: number): Promise<void> {
  for (;;) {
    try {
      const agent = await state.client.getAgent(target);
      if (agent.interactiveReady) {
        return;
      }
    } catch (error) {
      if (!isStarting(error)) {
        throw error;
      }
    }
    if (state.now() >= deadline) {
      throw new HerdrError("agent_not_ready", `agent ${target} was not interactive within ${READY_BUDGET_MS}ms`);
    }
    await state.delay(READY_POLL_MS);
  }
}

/** 刚起的 agent 要等 herdr 把它认成这个 pane 的具名 agent；在那之前 prompt 回 agent_not_ready。 */
export async function promptWhenReady(state: RunState, target: string, message: string): Promise<void> {
  const deadline = state.now() + READY_BUDGET_MS;
  for (;;) {
    await awaitAgentReady(state, target, deadline);
    try {
      await state.client.prompt(target, message);
      return;
    } catch (error) {
      if (!isStarting(error) || state.now() >= deadline) {
        throw error;
      }
      await state.delay(READY_POLL_MS);
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
