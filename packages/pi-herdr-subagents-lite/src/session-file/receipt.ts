import { readFileSync, writeFileSync } from "node:fs";

export interface ExitReceipt {
  reason: string;
}

export type ExitReceiptReader = (sessionFile: string) => ExitReceipt | null;

export type ExitReceiptWriter = (sessionFile: string, reason: string) => void;

function receiptFile(sessionFile: string): string {
  return `${sessionFile}.exit`;
}

export const readExitReceipt: ExitReceiptReader = (sessionFile) => {
  let raw: string;
  try {
    raw = readFileSync(receiptFile(sessionFile), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || !("reason" in parsed) || typeof parsed.reason !== "string") {
    return null;
  }
  return { reason: parsed.reason };
};

export const writeExitReceipt: ExitReceiptWriter = (sessionFile, reason) => {
  writeFileSync(receiptFile(sessionFile), JSON.stringify({ reason }));
};
