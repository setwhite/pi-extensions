import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { outputPath, questionsPath, resultPath } from "./paths.ts";
import { type ChildResult, type ChildResultState, readChildResult } from "./result.ts";
import type { ChildQuestion } from "./state.ts";

export interface ChildResultInput {
  state: ChildResultState;
  text?: string;
  questions?: ChildQuestion[];
  limit: number;
  now?: number;
}

async function readQuestions(runDir: string): Promise<ChildQuestion[] | undefined> {
  let raw: string;
  try {
    raw = await readFile(questionsPath(runDir), "utf8");
  } catch {
    return undefined;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) && parsed.length > 0 ? (parsed as ChildQuestion[]) : undefined;
  } catch {
    return undefined;
  }
}

async function writeAtomic(path: string, body: string): Promise<void> {
  const temp = `${path}.tmp`;
  await writeFile(temp, body, "utf8");
  await rename(temp, path);
}

/**
 * 子侧唯一的结果出口：原子替换 result.json，seq 单调递增。
 * 父侧只在 idle/done/blocked 时读它，此时 agent_settled 尚未上报，文件必然已写完。
 */
export async function writeChildResult(runDir: string, input: ChildResultInput): Promise<number> {
  const previous = await readChildResult(runDir);
  if (input.state === "needs_input" && input.questions !== undefined) {
    await writeAtomic(questionsPath(runDir), JSON.stringify(input.questions));
  }
  // 提问后的续写回合不能把 needs_input 盖成 turn_end，否则父代理就看不到问题了。
  const pending = await readQuestions(runDir);
  const payload: ChildResult = {
    seq: (previous?.seq ?? 0) + 1,
    state: pending === undefined ? input.state : "needs_input",
    at: input.now ?? Date.now(),
  };
  if (pending !== undefined) {
    payload.questions = pending;
  }
  if (input.text !== undefined) {
    payload.text = input.text;
    if (input.text.length > input.limit) {
      const file = outputPath(runDir);
      await writeFile(file, input.text, "utf8");
      payload.output = file;
    }
  }
  await writeAtomic(resultPath(runDir), JSON.stringify(payload));
  return payload.seq;
}

/** 父代理回答后清掉待答问题，下一次 turn_end 才写回 turn_end。 */
export async function clearChildQuestions(runDir: string): Promise<void> {
  await rm(questionsPath(runDir), { force: true });
}
