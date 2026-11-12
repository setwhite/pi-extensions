import type { HerdrHost } from "../herdr/index.ts";
import type { ProfileCatalog } from "../profile/index.ts";
import type { SessionTailReader } from "../session-file/index.ts";
import type { Aggregator } from "./aggregate.ts";
import type { ResultHandler, RunResult } from "./result.ts";

export type RunPhase = "running" | "idle" | "dead" | "closed";

export interface RunServiceDeps {
  host: HerdrHost;
  sessionsDir: string;
  readSessionTail: SessionTailReader;
  loadProfiles: () => ProfileCatalog;
  trusted: boolean;
  toolName: string;
  maxConcurrent: number;
  maxResultChars: number;
  aggregateWindowMs: number;
  livenessPollMs: number;
  closeOnFailure: boolean;
  onProblem: (message: string) => void;
  now?: () => number;
  delay?: (ms: number) => Promise<void>;
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
  // brief、identity、inbox、turn 事件、结果 artifact 共用的前缀。
  runBase: string;
  cwd: string;
  autoExit: boolean;
  lastTurn: number;
  artifactSeq: number;
  phase: RunPhase;
  absentChecks: number;
  paneClosed: boolean;
  deliveryFailures: number;
}

export interface RunState extends RunServiceDeps {
  runs: RunRecord[];
  pending: Set<Promise<unknown>>;
  stopped: boolean;
  resultHandler: ResultHandler | undefined;
  results: Aggregator<RunResult> | undefined;
  scanTimer?: ReturnType<typeof setInterval>;
  livenessTimer?: ReturnType<typeof setInterval>;
  scanning: boolean;
  scanAgain: boolean;
  now: () => number;
  delay: (ms: number) => Promise<void>;
  nextName(profile: string): string;
  active(): string[];
  available(): string[];
  release(run: RunRecord): void;
}
