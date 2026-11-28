import type { Config } from "../config/index.ts";
import type { HerdrClient } from "../herdr/index.ts";
import { createRunService, type EnvelopeHandler, pruneAgedDirs, type RunService } from "../run/index.ts";
import { createSubagentTool } from "../tool/index.ts";
import { deliverEnvelopes } from "./deliver.ts";
import type { ExtensionRegistrar } from "./types.ts";

export interface MainDeps {
  loadConfig(): Config;
  createClient(): HerdrClient;
  runsDir(): string;
  sessionsDir(): string;
}

/** 主代理侧：控制面工具 + 结算投递 + 收尾清理。零轮询、零上下文注入。 */
export function registerMain(pi: ExtensionRegistrar, deps: MainDeps): void {
  const config = deps.loadConfig();
  let service: RunService | undefined;
  let client: HerdrClient | undefined;

  function current(): RunService {
    if (service === undefined) {
      throw new Error("subagent service is not started");
    }
    return service;
  }

  pi.on("session_start", async (_event, ctx) => {
    service?.shutdown();
    client?.close();
    service = undefined;
    client = undefined;
    if (!config.enabled) {
      return;
    }
    const runsDir = deps.runsDir();
    const sessionsDir = deps.sessionsDir();
    await pruneAgedDirs(runsDir, config.runRetentionMs, Date.now());
    await pruneAgedDirs(sessionsDir, config.runRetentionMs, Date.now());
    client = deps.createClient();
    service = createRunService({
      client,
      runsDir,
      sessionsDir,
      maxConcurrent: config.maxConcurrent,
      excludeTools: config.excludeTools,
      summaryMaxChars: config.summaryMaxChars,
      aggregateWindowMs: config.aggregateWindowMs,
      interruptGraceMs: config.interruptGraceMs,
      onProblem: (message) => ctx.ui.notify(message, "error"),
    });
    const deliver: EnvelopeHandler = (batch) => deliverEnvelopes(pi, batch);
    service.onBatch(deliver);
    pi.registerTool(createSubagentTool({ config, service: current }));
  });

  pi.on("session_shutdown", async (event, ctx) => {
    const closing = service;
    const socket = client;
    service = undefined;
    client = undefined;
    try {
      if (closing === undefined) {
        return;
      }
      if (!(config.closeChildrenOn as readonly string[]).includes(event.reason)) {
        closing.shutdown();
        return;
      }
      const { failed } = await closing.closeChildren();
      for (const failure of failed) {
        ctx.ui.notify(`could not close child "${failure.id}": ${failure.reason}`, "error");
      }
    } finally {
      socket?.close();
    }
  });
}
