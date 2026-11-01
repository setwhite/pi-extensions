export interface SessionSnapshot {
  text: string | null;
  pendingToolCall: boolean;
  empty: boolean;
  unreadable: boolean;
}

interface SessionEntry {
  type?: unknown;
  message?: {
    role?: unknown;
    content?: unknown;
  };
}

function isTextBlock(block: unknown): block is { type: "text"; text: string } {
  if (typeof block !== "object" || block === null) {
    return false;
  }
  const candidate = block as { type?: unknown; text?: unknown };
  return candidate.type === "text" && typeof candidate.text === "string";
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

function textOf(entry: SessionEntry): string | null {
  const content = entry.message?.content;
  if (!Array.isArray(content)) {
    return null;
  }
  const text = content
    .filter(isTextBlock)
    .map((block) => block.text)
    .filter((block) => block.trim() !== "")
    .join("\n")
    .trim();
  return text === "" ? null : text;
}

export function parseLastAssistant(raw: string): SessionSnapshot {
  const lines = raw.split("\n");
  for (let index = lines.length - 1; index >= 0; index--) {
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
    return {
      text: textOf(entry),
      pendingToolCall: hasToolCall(entry.message?.content),
      empty: false,
      unreadable: false,
    };
  }
  return { text: null, pendingToolCall: false, empty: true, unreadable: false };
}
