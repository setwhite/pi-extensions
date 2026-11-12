import type { AgentEntry, AgentSnapshot, HerdrHost, StartAgentInput } from "../../src/herdr/index.ts";
import type { CreateTabInput, CreateWorkspaceInput, RenamePaneInput, RenameTabInput } from "../../src/herdr/pane.ts";
import { drainInbox, pendingInbox } from "./inbox.ts";

export function fakeHost(
  options: {
    events?: string[];
    failures?: {
      createTab?: (attempt: number) => Error | undefined;
      startAgent?: (attempt: number) => Error | undefined;
    };
    hooks?: { renamePane?: () => Promise<void> };
    closePane?: (paneId: string) => Error | undefined;
  } = {},
) {
  const calls: string[] = options.events ?? [];
  const tabs: CreateTabInput[] = [];
  const workspaces: CreateWorkspaceInput[] = [];
  const renamedTabs: RenameTabInput[] = [];
  const renamedPanes: RenamePaneInput[] = [];
  const agents: StartAgentInput[] = [];
  const inboxAtStart: number[] = [];

  let paneExists = true;
  let starts = 0;
  const paneAgents = new Map<string, { name: string; sessionFile: string }>();
  let agentImpl: (name: string) => Promise<AgentSnapshot | null> = async () => ({ status: "idle" });
  let listAgentsImpl: (() => Promise<AgentEntry[]>) | undefined;
  const host: HerdrHost = {
    async createWorkspace(input) {
      calls.push("createWorkspace");
      workspaces.push(input);
      return { workspaceId: "w2", tabId: "w2:t1", paneId: "w2:p1" };
    },
    async createTab(input) {
      calls.push("createTab");
      tabs.push(input);
      const error = options.failures?.createTab?.(tabs.length);
      if (error) {
        throw error;
      }
      return { tabId: `w1:t${tabs.length}`, paneId: `w1:p${tabs.length}` };
    },
    async renameTab(input) {
      calls.push("renameTab");
      renamedTabs.push(input);
    },
    async renamePane(input) {
      calls.push("renamePane");
      renamedPanes.push(input);
      await options.hooks?.renamePane?.();
    },
    async startAgent(input) {
      calls.push("startAgent");
      agents.push(input);
      paneAgents.set(input.paneId, { name: input.name, sessionFile: input.sessionFile });
      inboxAtStart.push(pendingInbox(input.sessionFile));
      drainInbox(input.sessionFile);
      starts += 1;
      const error = options.failures?.startAgent?.(starts);
      if (error) {
        throw error;
      }
    },
    async hasPane() {
      calls.push("hasPane");
      return paneExists;
    },
    async listAgents() {
      calls.push("listAgents");
      if (listAgentsImpl) {
        return listAgentsImpl();
      }
      const entries: AgentEntry[] = [];
      for (const [paneId, agent] of paneAgents) {
        const snapshot = await agentImpl(agent.name);
        if (snapshot) {
          entries.push({
            name: agent.name,
            paneId,
            sessionFile: agent.sessionFile,
            status: snapshot.status,
          });
        }
      }
      return entries;
    },
    async closePane(paneId) {
      calls.push("closePane");
      paneExists = false;
      const error = options.closePane?.(paneId);
      if (error) {
        throw error;
      }
    },
  };
  return {
    agents,
    calls,
    host,
    inboxAtStart,
    renamedPanes,
    renamedTabs,

    setAgents(impl: (name: string) => Promise<AgentSnapshot | null>) {
      agentImpl = impl;
    },
    setListAgents(impl: () => Promise<AgentEntry[]>) {
      listAgentsImpl = impl;
    },
    setPaneExists(value: boolean) {
      paneExists = value;
    },
    tabs,
    workspaces,
  };
}
