import type { Envelope } from "../run/index.ts";
import type { ExtensionRegistrar } from "./types.ts";

export function renderEnvelope(envelope: Envelope): string {
  const lines = [`[subagent ${envelope.id}] ${envelope.status}`];
  if (envelope.summary !== undefined) {
    lines.push(envelope.summary);
  }
  for (const question of envelope.questions ?? []) {
    const options = question.options === undefined ? "" : ` [${question.options.join(" | ")}]`;
    const context = question.context === undefined ? "" : ` (${question.context})`;
    lines.push(`? ${question.question}${context}${options}`);
  }
  const paths = [`session: ${envelope.paths.session}`];
  if (envelope.paths.worktree !== undefined) {
    paths.push(`worktree: ${envelope.paths.worktree}`);
  }
  if (envelope.paths.output !== undefined) {
    paths.push(`full text: ${envelope.paths.output}`);
  }
  lines.push(paths.join("\n"));
  if (envelope.truncated === true) {
    lines.push("(summary truncated; the full text is in the file above)");
  }
  return lines.join("\n");
}

/** 合并结算走宿主原生 followUp：空闲立即触发，忙则排到当前回合之后。 */
export function deliverEnvelopes(pi: ExtensionRegistrar, envelopes: Envelope[]): void {
  if (envelopes.length === 0) {
    return;
  }
  pi.sendMessage(
    { customType: "subagent_result", content: envelopes.map(renderEnvelope).join("\n\n"), display: true },
    { triggerTurn: true, deliverAs: "followUp" },
  );
}
