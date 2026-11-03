import { readFileSync, writeFileSync } from "node:fs";

export interface ExitReceipt {
  reason: string;
}

export type ExitReceiptReader = (base: string) => ExitReceipt | null;

export type ExitReceiptWriter = (base: string, reason: string) => void;

function receiptFile(base: string): string {
  return `${base}.exit`;
}

export const readExitReceipt: ExitReceiptReader = (base) => {
  let raw: string;
  try {
    raw = readFileSync(receiptFile(base), "utf8");
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

export const writeExitReceipt: ExitReceiptWriter = (base, reason) => {
  writeFileSync(receiptFile(base), JSON.stringify({ reason }));
};
