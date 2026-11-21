import { mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { OUTCOMES, type Turn, type TurnOutcome } from "./classify.ts";

const TURN_FILE = /^\d{6}\.json$/;

export function turnsDir(runBase: string): string {
  return `${runBase}.turns`;
}

export function turnFile(runBase: string, turn: number): string {
  return join(turnsDir(runBase), `${String(turn).padStart(6, "0")}.json`);
}

function writeAtomic(file: string, text: string): void {
  mkdirSync(dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  writeFileSync(temp, text);
  renameSync(temp, file);
}

export function writeTurn(runBase: string, turn: Turn): string {
  const file = turnFile(runBase, turn.turn);
  writeAtomic(file, JSON.stringify(turn));
  return file;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function readTurn(file: string): Turn | null {
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }
  const turn = parsed as Partial<Turn>;
  if (
    typeof turn.turn !== "number" ||
    typeof turn.stopReason !== "string" ||
    typeof turn.children !== "number" ||
    typeof turn.at !== "number" ||
    typeof turn.outcome !== "string" ||
    !OUTCOMES.has(turn.outcome)
  ) {
    return null;
  }
  const errorMessage = optionalString(turn.errorMessage);
  const text = optionalString(turn.text);
  return {
    turn: turn.turn,
    outcome: turn.outcome as TurnOutcome,
    stopReason: turn.stopReason,
    children: turn.children,
    at: turn.at,
    ...(errorMessage === undefined ? {} : { errorMessage }),
    ...(text === undefined ? {} : { text }),
  };
}

export function listTurns(runBase: string): string[] {
  let names: string[];
  try {
    names = readdirSync(turnsDir(runBase));
  } catch {
    return [];
  }
  return names
    .filter((name) => TURN_FILE.test(name))
    .sort()
    .map((name) => join(turnsDir(runBase), name));
}

export function removeTurn(file: string): void {
  try {
    unlinkSync(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}

// 子代理是唯一写入者，所以不需要锁。
export function nextTurn(runBase: string): number {
  const file = `${runBase}.turn`;
  let current = 0;
  try {
    const parsed = Number.parseInt(readFileSync(file, "utf8").trim(), 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      current = parsed;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
  const next = current + 1;
  writeAtomic(file, String(next));
  return next;
}
