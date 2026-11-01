import type { SessionStartEvent } from "@earendil-works/pi-coding-agent";
import type { ShutdownReason } from "../../src/config/index.ts";
import type { ExtensionRegistrar, SessionContext, SubagentTool } from "../../src/extension/index.ts";
import type { ShutdownHandler } from "../../src/extension/shutdown.ts";
import { projectDir } from "./env.ts";

interface SentMessage {
  message: { customType: string; content: string; display: boolean };
  options: { triggerTurn?: boolean } | undefined;
}

interface SentUserMessage {
  content: string;
  options: { deliverAs?: "steer" | "followUp" } | undefined;
}

type SessionStartHandler = (event: SessionStartEvent, ctx: SessionContext) => void;
type SettledHandler = (event: { type: "agent_settled" }, ctx: SessionContext) => void;
type PromptEvent = { kind: "select" | "confirm" | "input" | "editor" | "custom"; title?: string };
type PromptHandler = (event: PromptEvent) => void;

export function fakePi(events: string[] = []) {
  const tools: SubagentTool[] = [];
  const startHandlers: SessionStartHandler[] = [];
  const shutdownHandlers: ShutdownHandler[] = [];
  const settledHandlers: SettledHandler[] = [];
  const promptStartHandlers: PromptHandler[] = [];
  const promptEndHandlers: PromptHandler[] = [];
  const emitted: Array<{ channel: string; data: unknown }> = [];
  const sent: SentMessage[] = [];
  const userMessages: SentUserMessage[] = [];
  const notifications: Array<{ message: string; type: string | undefined }> = [];
  let currentSession: SessionContext | undefined;
  let shutdowns = 0;
  let sendUserMessageImpl: (content: string) => void = () => {};
  let sendFailures = 0;
  const pi: ExtensionRegistrar = {
    events: {
      emit(channel, data) {
        emitted.push({ channel, data });
      },
    },
    on(
      event: "session_start" | "session_shutdown" | "agent_settled" | "ui_prompt_start" | "ui_prompt_end",
      handler: SessionStartHandler | ShutdownHandler | SettledHandler | PromptHandler,
    ) {
      if (event === "session_shutdown") {
        shutdownHandlers.push(handler as ShutdownHandler);
      } else if (event === "session_start") {
        startHandlers.push(handler as SessionStartHandler);
      } else if (event === "agent_settled") {
        settledHandlers.push(handler as SettledHandler);
      } else {
        (event === "ui_prompt_start" ? promptStartHandlers : promptEndHandlers).push(handler as PromptHandler);
      }
    },
    registerTool(tool) {
      tools.push(tool);
    },
    sendMessage(message, options) {
      if (sendFailures > 0) {
        sendFailures -= 1;
        throw new Error("send failed");
      }
      events.push("sendMessage");
      sent.push({ message, options });
    },
    sendUserMessage(content, options) {
      userMessages.push({ content, options });
      sendUserMessageImpl(content);
    },
  };
  const startSession = (ctx: Partial<SessionContext> = {}) => {
    const session: SessionContext = {
      cwd: projectDir,
      isProjectTrusted: () => false,
      sessionManager: { getSessionFile: () => undefined },
      isIdle: () => true,
      ui: { notify: (message, type) => void notifications.push({ message, type }) },
      shutdown: () => {
        shutdowns += 1;
      },
      ...ctx,
    };
    currentSession = session;
    for (const handler of startHandlers) {
      handler({ type: "session_start", reason: "startup" }, session);
    }
  };
  const shutdownSession = async (reason: ShutdownReason = "quit") => {
    if (!currentSession) {
      throw new Error("no session");
    }
    const session = currentSession;
    for (const handler of shutdownHandlers) {
      await handler({ type: "session_shutdown", reason }, session);
    }
  };
  const settle = () => {
    if (!currentSession) {
      throw new Error("no session");
    }
    for (const handler of settledHandlers) {
      handler({ type: "agent_settled" }, currentSession);
    }
  };
  const prompt = (handlers: PromptHandler[], event: PromptEvent) => {
    for (const handler of handlers) {
      handler(event);
    }
  };
  return {
    emitted,
    get shutdowns() {
      return shutdowns;
    },
    notifications,
    pi,
    promptEnd: (event: PromptEvent = { kind: "custom" }) => prompt(promptEndHandlers, event),
    promptStart: (event: PromptEvent = { kind: "custom" }) => prompt(promptStartHandlers, event),
    sent,
    setSendFailures(count: number) {
      sendFailures = count;
    },
    setSendUserMessage(impl: (content: string) => void) {
      sendUserMessageImpl = impl;
    },
    settle,
    shutdownSession,
    startSession,
    tools,
    userMessages,
  };
}
