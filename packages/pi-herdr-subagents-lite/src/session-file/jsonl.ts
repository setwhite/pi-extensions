export interface TailSnapshot {
  pendingToolCall: boolean;
  empty: boolean;
}

interface SessionEntry {
  type?: unknown;
  message?: {
    role?: unknown;
    content?: unknown;
  };
}

function hasToolCall(content: unknown): boolean {
  if (!Array.isArray(content)) {
    return false;
  }
  return content.some((block) => {
    if (typeof block !== "object" || block === null) {
      return false;
    }
    const candidate = block as { type?: unknown; name?: unknown };
    return candidate.type === "toolCall" && typeof candidate.name === "string";
  });
}

// 只回答 send 续跑前的一个问题：最后一条 assistant 是不是停在工具调用上。
export function parseTail(raw: string): TailSnapshot {
  const lines = raw.split("\n");
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]?.trim();
    if (!line) {
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (typeof parsed !== "object" || parsed === null) {
      continue;
    }
    const entry = parsed as SessionEntry;
    if (entry.type !== "message" || entry.message?.role !== "assistant") {
      continue;
    }
    return { pendingToolCall: hasToolCall(entry.message.content), empty: false };
  }
  return { pendingToolCall: false, empty: true };
}
