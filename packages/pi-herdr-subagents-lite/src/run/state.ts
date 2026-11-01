import type { HerdrHost } from "../herdr/index.ts";
import type { ProfileCatalog } from "../profile/index.ts";
import type { ExitReceiptReader, SessionReader } from "../session-file/index.ts";
import type { Aggregator } from "./aggregate.ts";
import type { ResultHandler, RunResult } from "./result.ts";

export interface RunServiceDeps {
  host: HerdrHost;
  readLastAssistant: SessionReader;
  readExitReceipt: ExitReceiptReader;
  loadProfiles: () => ProfileCatalog;
  trusted: boolean;
  toolName: string;
  maxConcurrent: number;
  maxResultChars: number;
  aggregateWindowMs: number;
  pollIntervalMs: number;
  idlePollIntervalMs: number;
  onDeliveryError: (error: unknown) => void;
  now?: () => number;
}

export interface RunRead {
  seq: number;
  attempt: number;
  at: number;
}

export interface RunPane {
  tabId: string;
  paneId: string;
}

export interface RunRecord {
  name: string;
  profileName: string;
  pane: RunPane | undefined;
  paneLabel: string;
  sessionFile: string;
  cwd: string;
  autoExit: boolean;
  lastHandledSeq: number;
  lastDeliveredText: string | null;
  artifactSeq: number;
  read?: RunRead;
  pollFailures: number;
  busy: boolean;
  absentSince?: number;
  live: boolean;
}

export interface RunState extends RunServiceDeps {
  sessionsDir: string;
  runs: RunRecord[];
  pending: Set<Promise<unknown>>;
  stopped: boolean;
  resultHandler: ResultHandler | undefined;
  results: Aggregator<RunResult> | undefined;
  pollTimer?: ReturnType<typeof setTimeout>;
  pollBusy: boolean;
  activeUntil: number;
  now: () => number;
  nextName(profile: string): string;
  active(): string[];
  available(): string[];
  settle(run: RunRecord): void;
  release(run: RunRecord): void;
}
