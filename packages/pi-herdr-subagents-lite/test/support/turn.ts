import { nextTurn, type Turn, writeTurn } from "../../src/turn/index.ts";
import { baseOf } from "./paths.ts";

export function settleTurn(sessionFile: string, input: Partial<Turn> = {}): void {
  const base = baseOf(sessionFile);
  writeTurn(base, {
    turn: nextTurn(base),
    outcome: "done",
    stopReason: "stop",
    children: 0,
    at: Date.now(),
    ...input,
  });
}
