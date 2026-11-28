import { mkdtempSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRunService, type Envelope, type EnvelopeHandler } from "../../src/run/index.ts";
import { type FakeClient, fakeClient } from "./fake-client.ts";

export interface RunEnv {
  runsDir: string;
  sessionsDir: string;
  fake: FakeClient;
  service: ReturnType<typeof createRunService>;
  batches: Envelope[][];
  problems: string[];
}

const dirs: string[] = [];

export async function cleanupRuns(): Promise<void> {
  const pending = dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }));
  await Promise.all(pending);
}

export function setupRun(
  options: { maxConcurrent?: number; interruptGraceMs?: number; excludeTools?: string[] } = {},
): RunEnv {
  const runsDir = mkdtempSync(join(tmpdir(), "pi-herdr-run-"));
  const sessionsDir = mkdtempSync(join(tmpdir(), "pi-herdr-sessions-"));
  dirs.push(runsDir, sessionsDir);
  const fake = fakeClient();
  const batches: Envelope[][] = [];
  const problems: string[] = [];
  const service = createRunService({
    client: fake.client,
    runsDir,
    sessionsDir,
    maxConcurrent: options.maxConcurrent ?? 16,
    excludeTools: options.excludeTools ?? ["ask"],
    summaryMaxChars: 40,
    aggregateWindowMs: 0,
    interruptGraceMs: options.interruptGraceMs ?? 50,
    emptyResultGraceMs: 120,
    onProblem: (message) => problems.push(message),
  });
  const collect: EnvelopeHandler = (batch) => {
    batches.push(batch);
  };
  service.onBatch(collect);
  return { runsDir, sessionsDir, fake, service, batches, problems };
}

export async function writeResult(runsDir: string, id: string, result: Record<string, unknown>): Promise<void> {
  const dir = join(runsDir, id);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "result.json"), JSON.stringify(result));
}
