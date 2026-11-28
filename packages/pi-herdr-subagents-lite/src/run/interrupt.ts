import { errorText } from "./errors.ts";
import { closePaneOf, ensurePane, promptWhenReady } from "./pane.ts";
import { readChildResult } from "./result.ts";
import { failRun } from "./settle.ts";
import { clearInterrupt, type RunRecord, type RunState, targetOf, wakeWatch } from "./state.ts";

/** 运行中 steer：进入 interrupting，由 watch 单循环等 idle、超时重开与投递。 */
export async function armInterrupt(state: RunState, record: RunRecord, message: string): Promise<void> {
  record.pendingSteer = message;
  record.status = "interrupting";
  record.interruptDeadline ??= state.now() + state.interruptGraceMs;
  wakeWatch(record);
  const generation = record.generation;
  if (!(await agentBusy(state, record))) {
    return;
  }
  // 查状态期间 watch 可能已经把消息投递掉了、或 stop / 重开抢先：别再补一刀 esc 打断新回合。
  if (record.generation !== generation || record.status !== "interrupting") {
    return;
  }
  try {
    await state.client.sendKeys(targetOf(record), ["esc"]);
  } catch (error) {
    state.onProblem(`${record.id}: esc failed: ${errorText(error)}`);
  }
}

/** 先看真实状态：已经 idle / done 的子代理不用 esc，排队等 watch 直接投递。 */
async function agentBusy(state: RunState, record: RunRecord): Promise<boolean> {
  const target = record.paneId;
  if (target === undefined) {
    return false;
  }
  try {
    const agent = await state.client.getAgent(target);
    return agent.status !== "idle" && agent.status !== "done";
  } catch {
    return true; // 查不到状态就按忙碌处理：宁可按一次 esc，也不要让转向卡死。
  }
}

/** 收到 idle 确认打断生效后，投递排队的最新一条消息。 */
export async function submitPending(state: RunState, record: RunRecord): Promise<void> {
  if (record.status !== "interrupting") {
    return;
  }
  const message = record.pendingSteer;
  record.pendingSteer = undefined;
  clearInterrupt(record);
  record.status = "running";
  record.generation += 1;
  const generation = record.generation;
  // 被打断的半截回合也会写 result.json；先吃掉它的 seq，下一条消息的结算才不会被旧内容冒充。
  const interruptedTurn = await readChildResult(record.runDir);
  if (interruptedTurn !== undefined && interruptedTurn.seq > record.seq) {
    record.seq = interruptedTurn.seq;
  }
  if (message === undefined) {
    return;
  }
  if (record.generation !== generation || record.pendingSteer !== undefined) {
    // 读盘间隙被 stop 或新的 steer 抢先：最新一条留给 watch 投递。
    return;
  }
  try {
    await promptWhenReady(state, targetOf(record), message);
  } catch (error) {
    if (record.generation !== generation || record.status !== "running" || record.pendingSteer !== undefined) {
      return; // stop 或新的 steer 抢先：交给对应的那条路径，别为旧消息重开 pane。
    }
    await reopenAndSubmit(state, record, message, `steer prompt failed: ${errorText(error)}`);
  }
}

/** 原地投递失败或打断超时：关旧 pane、按原 session 重开，再投一次；仍失败才判 failed。 */
export async function reopenAndSubmit(
  state: RunState,
  record: RunRecord,
  message: string | undefined,
  reason: string,
): Promise<void> {
  state.onProblem(`${record.id}: ${reason}`);
  if (record.pendingSteer === message) {
    record.pendingSteer = undefined;
  }
  clearInterrupt(record);
  record.generation += 1;
  const generation = record.generation;
  await closePaneOf(state, record);
  try {
    await ensurePane(state, record);
    if (record.generation !== generation) {
      // stop / closeChildren 在重开期间抢先：新 pane 不能留在侧边栏。
      await closePaneOf(state, record);
      return;
    }
    if (record.pendingSteer !== undefined) {
      // 重开期间又来了 steer：watch 等下一次 idle 投递最新一条。
      record.status = "interrupting";
      record.interruptDeadline = state.now() + state.interruptGraceMs;
      return;
    }
    record.status = "running";
    if (message !== undefined) {
      await promptWhenReady(state, targetOf(record), message);
    }
  } catch (error) {
    await failRun(state, record, `${reason}: ${errorText(error)}`);
  }
}
