import { readFileSync, statSync } from "node:fs";
import { parseLastAssistant, type SessionSnapshot } from "./jsonl.ts";
import { readTail, TAIL_WINDOW_BYTES } from "./tail.ts";

export {
  type ExitReceipt,
  type ExitReceiptReader,
  type ExitReceiptWriter,
  readExitReceipt,
  writeExitReceipt,
} from "./receipt.ts";

export type SessionReader = (path: string) => SessionSnapshot;

const UNREADABLE: SessionSnapshot = { text: null, pendingToolCall: false, empty: false, unreadable: true };

export const readLastAssistant: SessionReader = (path) => {
  try {
    const size = statSync(path).size;
    if (size > TAIL_WINDOW_BYTES) {
      const tail = parseLastAssistant(readTail(path, size));
      if (!tail.empty) {
        return tail;
      }
    }
    return parseLastAssistant(readFileSync(path, "utf8"));
  } catch {
    return { ...UNREADABLE };
  }
};
