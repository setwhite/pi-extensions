import { errorText } from "../error/index.ts";
import { writeArtifact } from "./artifact.ts";
import type { RunRecord } from "./state.ts";
import { leadingChars } from "./truncate.ts";

export type RunOutcome = "done" | "error" | "aborted" | "quit" | "lost";

export interface RunResult {
  state: RunOutcome;
  name: string;
  text?: string;
  errorMessage?: string;
  artifact?: string;
  warning?: string;
}

export type ResultHandler = (results: RunResult[]) => void | Promise<void>;

export interface ResultInput {
  state: RunOutcome;
  text?: string | null;
  errorMessage?: string;
}

export async function makeResult(run: RunRecord, input: ResultInput, limit: number): Promise<RunResult> {
  const base: RunResult = { state: input.state, name: run.name };
  if (input.errorMessage !== undefined) {
    base.errorMessage = input.errorMessage;
  }
  const text = input.text ?? undefined;
  if (text === undefined || text.length <= limit) {
    if (text !== undefined) {
      base.text = text;
    }
    return base;
  }
  const head = leadingChars(text, limit);
  const seq = run.artifactSeq + 1;
  try {
    const artifact = await writeArtifact(run.runBase, seq, text);
    run.artifactSeq = seq;
    return { ...base, text: head, artifact };
  } catch (error) {
    return { ...base, text: head, warning: `[artifact write failed: ${errorText(error)}]` };
  }
}
