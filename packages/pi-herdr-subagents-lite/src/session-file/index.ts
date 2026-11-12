import { readFileSync, statSync } from "node:fs";
import { parseTail } from "./jsonl.ts";
import { readTail, TAIL_WINDOW_BYTES } from "./tail.ts";

export interface SessionTail {
  pendingToolCall: boolean;
  unreadable: boolean;
}

export type SessionTailReader = (path: string) => SessionTail;

const UNREADABLE: SessionTail = { pendingToolCall: false, unreadable: true };

// 读最后一条 assistant，只为了判断 send 能不能安全续跑。
export const readSessionTail: SessionTailReader = (path) => {
  try {
    const size = statSync(path).size;
    if (size > TAIL_WINDOW_BYTES) {
      const tail = parseTail(readTail(path, size));
      if (!tail.empty) {
        return { pendingToolCall: tail.pendingToolCall, unreadable: false };
      }
    }
    return { pendingToolCall: parseTail(readFileSync(path, "utf8")).pendingToolCall, unreadable: false };
  } catch {
    return { ...UNREADABLE };
  }
};
