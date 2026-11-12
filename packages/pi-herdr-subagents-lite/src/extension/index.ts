import type { SessionStartEvent } from "@earendil-works/pi-coding-agent";
import { createBridge } from "../bridge/index.ts";
import type { BlockedKind, Config } from "../config/index.ts";
import { errorText } from "../error/index.ts";
import type { HerdrHost } from "../herdr/index.ts";
import { drain, hasInbox, pumpInbox } from "../inbox/index.ts";
import type { ProfileCatalog, ProfileSources } from "../profile/index.ts";
import { childSessionsDir, createRunService, type RunService, runBaseOf } from "../run/index.ts";
import type { SessionTailReader } from "../session-file/index.ts";
import { createTool, type ResultMessage, type SubagentTool, sendResults } from "../tool/index.ts";
import type { TurnEntry } from "../turn/index.ts";
import { watchReport } from "./report.ts";
import { type ShutdownHandler, watchShutdown } from "./shutdown.ts";

export interface ExtensionDeps {
  createHost: (config: Config) => HerdrHost;
  readSessionTail: SessionTailReader;
  loadConfig: () => Config;
  loadProfiles: (sources: ProfileSources) => ProfileCatalog;
}

export interface SessionContext {
  cwd: string;
  isProjectTrusted(): boolean;
  sessionManager: {
    getSessionFile(): string | undefined;
    getBranch(): TurnEntry[];
  };
  isIdle(): boolean;
  ui: { notify(message: string, type?: "info" | "warning" | "error"): void };
  shutdown(): void;
}

export type { SubagentTool };

type SessionStartHandler = (event: SessionStartEvent, ctx: SessionContext) => void;
type SettledHandler = (event: { type: "agent_settled"; aborted: boolean }, ctx: SessionContext) => void;
type PromptHandler = (event: { kind: BlockedKind; title?: string }) => void;

export interface ExtensionRegistrar {
  events: { emit(channel: string, data: unknown): void };
  on(event: "session_start", handler: SessionStartHandler): void;
  on(event: "session_shutdown", handler: ShutdownHandler): void;
  on(event: "agent_settled", handler: SettledHandler): void;
  on(event: "ui_prompt_start" | "ui_prompt_end", handler: PromptHandler): void;
  registerTool(tool: SubagentTool): void;
  sendMessage(message: ResultMessage, options?: { triggerTurn?: boolean }): void;
  sendUserMessage(content: string, options?: { deliverAs?: "steer" | "followUp" }): void;
}

const INBOX_FAILURE_LIMIT = 3;

export function createExtension(deps: ExtensionDeps): (pi: ExtensionRegistrar) => void {
  return (pi: ExtensionRegistrar) => {
    const config = deps.loadConfig();
    const host = deps.createHost(config);
    let service: RunService | undefined;
    let stopPump: (() => void) | undefined;
    let inboxFailures = 0;
    createBridge(pi, config.bridge);
    watchReport(pi, { activeChildren: () => service?.active().length ?? 0 });

    const stopInbox = () => {
      stopPump?.();
      stopPump = undefined;
    };

    watchShutdown(pi, {
      config,
      stopInbox,
      takeService() {
        const current = service;
        service = undefined;
        return current;
      },
    });

    const startInbox = (ctx: SessionContext) => {
      const sessionFile = ctx.sessionManager.getSessionFile();
      if (sessionFile === undefined) {
        return;
      }
      const base = runBaseOf(sessionFile);
      if (!hasInbox(base)) {
        return;
      }
      inboxFailures = 0;
      const deliver = (text: string) => {
        pi.sendUserMessage(text, ctx.isIdle() ? undefined : { deliverAs: "steer" });
      };
      stopPump = pumpInbox({
        pollMs: config.inboxPollMs,
        tick: () => drain(base, deliver),
        onCycle(error) {
          if (error === undefined) {
            inboxFailures = 0;
            return;
          }
          inboxFailures += 1;
          if (inboxFailures < INBOX_FAILURE_LIMIT) {
            return;
          }
          stopInbox();
          const detail = errorText(error);
          ctx.ui.notify(`subagent messages stopped after ${INBOX_FAILURE_LIMIT} delivery failures: ${detail}`, "error");
        },
      });
    };

    const startService = (sources: ProfileSources, ctx: SessionContext) => {
      service?.shutdown();
      service = createRunService({
        host,
        sessionsDir: childSessionsDir(ctx.sessionManager.getSessionFile()),
        readSessionTail: deps.readSessionTail,
        loadProfiles: () => deps.loadProfiles(sources),
        trusted: sources.trusted,
        maxConcurrent: config.maxConcurrent,
        maxResultChars: config.maxResultChars,
        aggregateWindowMs: config.aggregateWindowMs,
        livenessPollMs: config.livenessPollMs,
        closeOnFailure: config.closeOnFailure,
        toolName: config.toolName,
        onProblem: (message) => ctx.ui.notify(message, "error"),
      });
      service.onResult((results) => sendResults(pi, results));
    };

    const currentService = (): RunService => {
      if (!service) {
        throw new Error("subagent service is not started");
      }
      return service;
    };

    pi.on("session_start", (_event, ctx) => {
      stopInbox();
      const sources = { cwd: ctx.cwd, trusted: ctx.isProjectTrusted() };
      startService(sources, ctx);
      if (config.enabled) {
        const profiles = deps.loadProfiles(sources).profiles;
        pi.registerTool(createTool({ config, profiles, service: currentService }));
      }
      startInbox(ctx);
    });
  };
}
