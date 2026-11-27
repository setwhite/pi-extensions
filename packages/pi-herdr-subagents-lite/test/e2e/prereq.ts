// 真机 e2e 的前置条件：缺 herdr、pi 或模型 auth 时整组跳过。
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const REAL_AGENT_DIR = process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");

export interface Prereq {
  ok: boolean;
  reason?: string;
}

function runnable(path: string): boolean {
  if (!existsSync(path)) {
    return false;
  }
  if (process.platform !== "win32") {
    return true;
  }
  return /\.(exe|cmd|bat)$/i.test(path);
}

function findBin(names: string[]): string | undefined {
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    if (dir === "") {
      continue;
    }
    for (const name of names) {
      const candidate = join(dir, name);
      if (runnable(candidate)) {
        return candidate;
      }
    }
  }
  return undefined;
}

export const HERDR_BIN = process.env.HERDR_BIN ?? findBin(["herdr.exe", "herdr"]);
export const PI_BIN = process.env.PI_BIN ?? findBin(["pi.exe", "pi"]);

export function prereqs(): Prereq {
  if (HERDR_BIN === undefined) {
    return { ok: false, reason: "herdr not found on PATH (set HERDR_BIN)" };
  }
  if (!runnable(HERDR_BIN)) {
    return { ok: false, reason: `HERDR_BIN=${HERDR_BIN} is not an executable file` };
  }
  if (PI_BIN === undefined) {
    return { ok: false, reason: "pi not found on PATH (set PI_BIN)" };
  }
  if (!runnable(PI_BIN)) {
    return { ok: false, reason: `PI_BIN=${PI_BIN} is not an executable file` };
  }
  if (!existsSync(join(REAL_AGENT_DIR, "auth.json"))) {
    return { ok: false, reason: `no model auth (${join(REAL_AGENT_DIR, "auth.json")} missing)` };
  }
  return { ok: true };
}
