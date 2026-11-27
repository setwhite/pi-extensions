import { readFile } from "node:fs/promises";
import { outputPath, resultPath } from "./paths.ts";
import { type RunStatus, truncateSummary } from "./rules.ts";
import type { ChildQuestion, RunRecord } from "./state.ts";

export type ChildResultState = "turn_end" | "needs_input";

export interface ChildResult {
  seq: number;
  state: ChildResultState;
  text?: string;
  questions?: ChildQuestion[];
  /** 子侧原文超限时落盘的全文路径。 */
  output?: string;
  at?: number;
}

export interface Envelope {
  id: string;
  status: RunStatus;
  summary?: string;
  truncated?: boolean;
  paths: { session: string; worktree?: string; output?: string };
  questions?: ChildQuestion[];
}

export async function readChildResult(runDir: string): Promise<ChildResult | undefined> {
  let raw: string;
  try {
    raw = await readFile(resultPath(runDir), "utf8");
  } catch {
    return undefined;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<ChildResult>;
    if (typeof parsed.seq !== "number" || Number.isInteger(parsed.seq) === false) {
      return undefined;
    }
    if (parsed.state !== "turn_end" && parsed.state !== "needs_input") {
      return undefined;
    }
    return parsed as ChildResult;
  } catch {
    return undefined;
  }
}

export function buildEnvelope(record: RunRecord, result: ChildResult | undefined, limit: number): Envelope {
  const paths: Envelope["paths"] = { session: record.sessionFile };
  if (record.worktree !== undefined) {
    paths.worktree = record.worktree.path;
  }
  const envelope: Envelope = { id: record.id, status: record.status, paths };
  const text = result?.text;
  if (text !== undefined && text.trim() !== "") {
    const { summary, truncated } = truncateSummary(text, limit);
    envelope.summary = summary;
    if (truncated || result?.output !== undefined) {
      envelope.paths.output = result?.output ?? outputPath(record.runDir);
    }
    if (truncated) {
      envelope.truncated = true;
    }
  }
  if (result?.questions !== undefined && result.questions.length > 0) {
    envelope.questions = result.questions;
  }
  return envelope;
}
