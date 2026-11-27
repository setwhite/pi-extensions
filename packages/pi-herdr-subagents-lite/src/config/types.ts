export const SHUTDOWN_REASONS = ["new", "resume", "fork", "quit", "reload"] as const;
export type ShutdownReason = (typeof SHUTDOWN_REASONS)[number];

export const CONFIG_KEYS = [
  "enabled",
  "toolName",
  "excludeTools",
  "maxConcurrent",
  "summaryMaxChars",
  "aggregateWindowMs",
  "interruptGraceMs",
  "closeChildrenOn",
  "runRetentionMs",
] as const;

export interface Config {
  enabled: boolean;
  toolName: string;
  excludeTools: string[];
  maxConcurrent: number;
  summaryMaxChars: number;
  aggregateWindowMs: number;
  interruptGraceMs: number;
  closeChildrenOn: ShutdownReason[];
  runRetentionMs: number;
}
