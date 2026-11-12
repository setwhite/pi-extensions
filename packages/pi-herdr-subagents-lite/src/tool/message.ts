import type { RunResult } from "../run/index.ts";

export interface ResultMessage {
  customType: string;
  content: string;
  display: boolean;
}

interface MessageSink {
  sendMessage(message: ResultMessage, options?: { triggerTurn?: boolean }): void;
}

const LABEL: Record<RunResult["state"], string> = {
  done: "done",
  error: "failed",
  aborted: "interrupted",
  quit: "stopped before reporting a result",
  lost: "lost contact; no result",
};

function resultText(result: RunResult): string {
  const tag = `[subagent ${result.name}]`;
  const artifact = result.artifact ? `\n\nFull result: ${result.artifact}` : "";
  const warning = result.warning ? `\n\n${result.warning}` : "";
  if (result.state === "done") {
    return `${tag} done\n\n${result.text ?? ""}${artifact}${warning}`;
  }
  const reason = result.errorMessage === undefined ? "" : `\n\n${result.errorMessage}`;
  const partial = result.text === undefined ? "" : `\n\nPartial answer (not a completed result):\n${result.text}`;
  return `${tag} ${LABEL[result.state]}${reason}${partial}${artifact}${warning}`;
}

export function sendResults(sink: MessageSink, results: RunResult[]): void {
  const content = results.map(resultText).join("\n\n");
  sink.sendMessage({ customType: "subagent_result", content, display: true }, { triggerTurn: true });
}
