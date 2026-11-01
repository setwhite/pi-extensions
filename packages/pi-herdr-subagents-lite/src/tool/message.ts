import type { RunResult, UnknownReason } from "../run/index.ts";

export interface ResultMessage {
  customType: string;
  content: string;
  display: boolean;
}

interface MessageSink {
  sendMessage(message: ResultMessage, options?: { triggerTurn?: boolean }): void;
}

const UNKNOWN_TEXT: Record<UnknownReason, string> = {
  poll_failed: "status could not be read",
  no_result: "no result was read",
  close_failed: "result delivered, but the tab did not close",
  quitted: "the child exited without a result",
  pane_exited: "the pane exited without a result",
};

function resultText(result: RunResult): string {
  if (result.state === "unknown") {
    return `[subagent ${result.name}] ${UNKNOWN_TEXT[result.reason]}\n\nSession file: ${result.sessionFile}`;
  }
  const artifact = result.artifact ? `\n\nFull result: ${result.artifact}` : "";
  const warning = result.warning ? `\n\n${result.warning}` : "";
  return `[subagent ${result.name}] done\n\n${result.text}${artifact}${warning}`;
}

export function sendResults(sink: MessageSink, results: RunResult[]): void {
  const content = results.map(resultText).join("\n\n");
  sink.sendMessage({ customType: "subagent_result", content, display: true }, { triggerTurn: true });
}
