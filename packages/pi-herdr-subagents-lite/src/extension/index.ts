import type { SessionStartEvent } from "@earendil-works/pi-coding-agent";
import { createBridge } from "../bridge/index.ts";
import type { BlockedKind, Config } from "../config/index.ts";
import { errorText } from "../error/index.ts";
import type { HerdrHost } from "../herdr/index.ts";
import { drain, hasInbox, pumpInbox } from "../inbox/index.ts";
import type { ProfileCatalog, ProfileSources } from "../profile/index.ts";
import { createRunService, type RunService } from "../run/index.ts";
import type { ExitReceiptReader, ExitReceiptWriter, SessionReader } from "../session-file/index.ts";
import { createTool, type ResultMessage, type SubagentTool, sendResults } from "../tool/index.ts";
import { watchAutoExit } from "./auto-exit.ts";
import { type ShutdownHandler, watchShutdown } from "./shutdown.ts";

export interface ExtensionDeps {
  createHost: (config: Config) => HerdrHost;
  readLastAssistant: SessionReader;
  readExitReceipt: ExitReceiptReader;
  writeExitReceipt: ExitReceiptWriter;
  loadConfig: () => Config;
  loadProfiles: (sources: ProfileSources) => ProfileCatalog;
}

export interface SessionContext {
  cwd: string;
  isProjectTrusted(): boolean;
  sessionManager: { getSessionFile(): string | undefined };
  isIdle(): boolean;
  ui: { notify(message: string, type?: "info" | "warning" | "error"): void };
  shutdown(): void;
}

export type { SubagentTool };

type SessionStartHandler = (event: SessionStartEvent, ctx: SessionContext) => void;
type SettledHandler = (event: { type: "agent_settled" }, ctx: SessionContext) => void;
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
    const autoExit = watchAutoExit(pi);

    const stopInbox = () => {
      stopPump?.();
      stopPump = undefined;
    };

    watchShutdown(pi, {
      config,
      writeExitReceipt: deps.writeExitReceipt,
      stopInbox,
      takeService() {
        const current = service;
        service = undefined;
        return current;
      },
    });

    const startInbox = (ctx: SessionContext) => {
      const sessionFile = ctx.sessionManager.getSessionFile();
      if (!sessionFile || !hasInbox(sessionFile)) {
        return;
      }
      inboxFailures = 0;
      const deliver = (text: string) => {
        pi.sendUserMessage(text, ctx.isIdle() ? undefined : { deliverAs: "steer" });
      };
      stopPump = pumpInbox({
        pollMs: config.inboxPollMs,
        tick: () => drain(sessionFile, deliver),
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
        readLastAssistant: deps.readLastAssistant,
        readExitReceipt: deps.readExitReceipt,
        loadProfiles: () => deps.loadProfiles(sources),
        trusted: sources.trusted,
        maxConcurrent: config.maxConcurrent,
        maxResultChars: config.maxResultChars,
        aggregateWindowMs: config.aggregateWindowMs,
        pollIntervalMs: config.pollIntervalMs,
        idlePollIntervalMs: config.idlePollIntervalMs,
        toolName: config.toolName,
        onDeliveryError: (error) => ctx.ui.notify(`subagent result not delivered: ${errorText(error)}`, "error"),
      });
      service.onResult((results) => sendResults(pi, results));
    };

    pi.on("session_start", (_event, ctx) => {
      stopInbox();
      autoExit.reset();
      const sources = { cwd: ctx.cwd, trusted: ctx.isProjectTrusted() };
      startService(sources, ctx);
      if (config.enabled) {
        const profiles = deps.loadProfiles(sources).profiles;
        pi.registerTool(createTool({ config, profiles, service: currentService }));
      }
      startInbox(ctx);
    });

    const currentService = (): RunService => {
      if (!service) {
        throw new Error("subagent service is not started");
      }
      return service;
    };
  };
}
