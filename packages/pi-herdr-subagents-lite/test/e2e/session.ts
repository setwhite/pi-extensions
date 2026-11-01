// 读 pi 的 session JSONL：只解析完整行，半行留到下一拍。
import { existsSync, readFileSync } from "node:fs";

export interface StartedRun {
  state: "running";
  name: string;
  paneId: string;
  sessionFile: string;
}

export interface SentMessage {
  state: "sent";
  name: string;
}

export interface RestartedRun {
  state: "restarted";
  name: string;
  paneId: string;
}

interface ToolResult {
  text: string;
  isError: boolean;
}

export function entries(file: string): unknown[] {
  if (!existsSync(file)) {
    return [];
  }
  const out: unknown[] = [];
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const text = line.trim();
    if (text === "") {
      continue;
    }
    try {
      out.push(JSON.parse(text));
    } catch {
      // 半行：pi 正在写，下一拍再读。
    }
  }
  return out;
}

export function textOf(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (!Array.isArray(value)) {
    return "";
  }
  return value
    .map((block) =>
      typeof block === "object" && block !== null && typeof (block as { text?: unknown }).text === "string"
        ? (block as { text: string }).text
        : "",
    )
    .join("");
}

export function hasToolCall(file: string): boolean {
  for (const entry of entries(file)) {
    const record = entry as { type?: string; message?: { content?: unknown } };
    const content = record.message?.content;
    if (record.type !== "message" || !Array.isArray(content)) {
      continue;
    }
    if (
      content.some(
        (block) => typeof block === "object" && block !== null && (block as { type?: unknown }).type === "toolCall",
      )
    ) {
      return true;
    }
  }
  return false;
}

function toolResults(file: string): ToolResult[] {
  const out: ToolResult[] = [];
  for (const entry of entries(file)) {
    const record = entry as { type?: string; message?: { role?: string; content?: unknown; isError?: unknown } };
    if (record.type !== "message" || record.message?.role !== "toolResult") {
      continue;
    }
    out.push({ text: textOf(record.message.content), isError: record.message.isError === true });
  }
  return out;
}

export function results<T>(file: string, state: string): T[] {
  const out: T[] = [];
  for (const result of toolResults(file)) {
    if (result.isError) {
      continue;
    }
    try {
      const parsed = JSON.parse(result.text) as { state?: string };
      if (parsed.state === state) {
        out.push(parsed as T);
      }
    } catch {
      // 非 JSON 的成功结果不是本工具。
    }
  }
  return out;
}

export function errors(file: string, code: string): string[] {
  return toolResults(file)
    .filter((result) => result.isError && result.text.startsWith(`${code}:`))
    .map((result) => result.text);
}

export function messages(file: string, customType: string): string[] {
  const out: string[] = [];
  for (const entry of entries(file)) {
    const record = entry as { type?: string; customType?: string; content?: unknown };
    if (record.type === "custom_message" && record.customType === customType) {
      out.push(textOf(record.content));
    }
  }
  return out;
}
