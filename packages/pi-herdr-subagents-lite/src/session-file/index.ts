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

export interface SessionRead extends SessionSnapshot {
  // 读取时文件的字节数。session 只追加，所以它同时是尾部的身份。读不到时为 -1。
  size: number;
}

export type SessionReader = (path: string) => SessionRead;

const UNREADABLE: SessionRead = { text: null, pendingToolCall: false, empty: false, unreadable: true, size: -1 };

export const readLastAssistant: SessionReader = (path) => {
  try {
    const size = statSync(path).size;
    if (size > TAIL_WINDOW_BYTES) {
      const tail = parseLastAssistant(readTail(path, size));
      if (!tail.empty) {
        return { ...tail, size };
      }
    }
    return { ...parseLastAssistant(readFileSync(path, "utf8")), size };
  } catch {
    return { ...UNREADABLE };
  }
};
