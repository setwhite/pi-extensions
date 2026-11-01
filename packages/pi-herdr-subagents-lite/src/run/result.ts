import { errorText } from "../error/index.ts";
import { writeArtifact } from "./artifact.ts";
import type { RunRecord } from "./state.ts";
import { leadingChars } from "./truncate.ts";

export interface DoneResult {
  state: "done";
  name: string;
  text: string;
  artifact?: string;
  warning?: string;
  sessionFile: string;
}

export type UnknownReason = "poll_failed" | "no_result" | "close_failed" | "quitted" | "pane_exited";

export interface UnknownResult {
  state: "unknown";
  name: string;
  reason: UnknownReason;
  sessionFile: string;
}

export type RunResult = DoneResult | UnknownResult;

export type ResultHandler = (results: RunResult[]) => void | Promise<void>;

export async function doneResult(run: RunRecord, text: string, limit: number): Promise<DoneResult> {
  const base = { state: "done" as const, name: run.name, sessionFile: run.sessionFile };
  if (text.length <= limit) {
    return { ...base, text };
  }
  const head = leadingChars(text, limit);
  const seq = run.artifactSeq + 1;
  try {
    const artifact = await writeArtifact(run.sessionFile, seq, text);
    run.artifactSeq = seq;
    return { ...base, text: head, artifact };
  } catch (error) {
    return { ...base, text: head, warning: `[artifact write failed: ${errorText(error)}]` };
  }
}

export function unknownResult(run: RunRecord, reason: UnknownReason): UnknownResult {
  return {
    state: "unknown",
    name: run.name,
    reason,
    sessionFile: run.sessionFile,
  };
}
