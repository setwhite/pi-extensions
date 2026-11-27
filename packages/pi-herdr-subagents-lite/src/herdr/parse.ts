import { HerdrError } from "./socket.ts";

export const QUERY_MS = 20_000;
export const MUTATION_MS = 120_000;

export function resultOf(value: unknown, type: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    throw new HerdrError("herdr_protocol", `empty result, expected ${type}`);
  }
  const record = value as Record<string, unknown>;
  if (record.type !== type) {
    throw new HerdrError("herdr_protocol", `expected ${type}, got ${String(record.type)}`);
  }
  return record;
}

export function nested(record: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = record[key];
  if (typeof value !== "object" || value === null) {
    throw new HerdrError("herdr_protocol", `${key}: expected object`);
  }
  return value as Record<string, unknown>;
}

export function text(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value === "") {
    throw new HerdrError("herdr_protocol", `${key}: expected non-empty string`);
  }
  return value;
}
