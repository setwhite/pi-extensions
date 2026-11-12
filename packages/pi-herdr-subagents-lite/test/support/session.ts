import { vi } from "vitest";
import { loadConfig } from "../../src/config/index.ts";
import {
  createExtension,
  type ExtensionRegistrar,
  type SessionContext,
  type SubagentTool,
} from "../../src/extension/index.ts";
import type { AgentSnapshot, HerdrHost } from "../../src/herdr/index.ts";
import { loadProfiles, agentDir as resolveAgentDir } from "../../src/profile/index.ts";
import { readSessionTail } from "../../src/session-file/index.ts";
import { fakeHost } from "./host.ts";
import { fakePi } from "./pi.ts";

export function registerExtension(pi: ExtensionRegistrar, host: HerdrHost) {
  createExtension({
    createHost: () => host,
    readSessionTail,
    loadConfig: () => loadConfig(resolveAgentDir()),
    loadProfiles,
  })(pi);
}

export function loadSession(host: HerdrHost, events: string[] = [], ctx?: Partial<SessionContext>) {
  const fake = fakePi(events);
  const { notifications, pi, sent, shutdownSession, startSession, tools } = fake;
  registerExtension(pi, host);
  startSession(ctx);
  const tool = tools[0];
  if (tools.length !== 1 || !tool) {
    throw new Error(`expected one registered tool, got ${tools.length}`);
  }
  return { notifications, sent, setSendFailures: fake.setSendFailures, shutdownSession, startSession, tool };
}

export function loadTool(host: HerdrHost, ctx?: Partial<SessionContext>): SubagentTool {
  return loadSession(host, [], ctx).tool;
}

export function loadTimedSession(
  getAgent: (name: string) => Promise<AgentSnapshot | null>,
  closePane?: (paneId: string) => Error | undefined,
) {
  vi.useFakeTimers();
  process.env.HERDR_ENV = "1";
  const calls: string[] = [];
  const fake = fakeHost({ events: calls, closePane });
  fake.setAgents(getAgent);
  return { ...loadSession(fake.host, calls), calls, fake };
}

export function loadChild(sessionFile: string | undefined, options: { isIdle?: () => boolean } = {}) {
  const fake = fakePi();
  registerExtension(fake.pi, fakeHost().host);
  fake.startSession({
    sessionManager: { getSessionFile: () => sessionFile, getBranch: () => [] },
    isIdle: options.isIdle ?? (() => true),
  });
  return fake;
}
