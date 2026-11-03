import { randomUUID } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const MESSAGE_SUFFIX = ".md";

function inboxDir(base: string): string {
  return `${base}.inbox`;
}

export function hasInbox(base: string): boolean {
  try {
    return statSync(inboxDir(base)).isDirectory();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

export function createInbox(base: string): void {
  mkdirSync(inboxDir(base), { recursive: true });
}

export function removeInbox(base: string): void {
  rmSync(inboxDir(base), { recursive: true, force: true });
}

function pendingNames(dir: string): string[] {
  try {
    return readdirSync(dir)
      .filter((name) => name.endsWith(MESSAGE_SUFFIX))
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

export function inboxCount(base: string): number {
  return pendingNames(inboxDir(base)).length;
}

export function enqueue(base: string, text: string): void {
  const dir = inboxDir(base);
  mkdirSync(dir, { recursive: true });
  const name = `${String(process.hrtime.bigint()).padStart(20, "0")}-${randomUUID()}${MESSAGE_SUFFIX}`;
  const temp = join(dir, `.${randomUUID()}.tmp`);
  writeFileSync(temp, text, "utf8");
  renameSync(temp, join(dir, name));
}

export function drain(base: string, deliver: (text: string) => void): number {
  const dir = inboxDir(base);
  let delivered = 0;
  for (const name of pendingNames(dir)) {
    const path = join(dir, name);
    const text = readFileSync(path, "utf8");
    deliver(text);
    rmSync(path, { force: true });
    delivered += 1;
  }
  return delivered;
}

export { pumpInbox } from "./pump.ts";
