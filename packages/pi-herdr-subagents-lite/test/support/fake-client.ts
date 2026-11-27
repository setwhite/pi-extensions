import type { AgentStatus, CreateTabInput, HerdrClient, PaneState, StartAgentInput } from "../../src/herdr/index.ts";

type Waiter = { resolve(status: AgentStatus): void; reject(error: Error): void };

export interface FakeClient {
  client: HerdrClient;
  calls: string[];
  prompts: string[];
  closedPanes: string[];
  tabs: CreateTabInput[];
  agents: StartAgentInput[];
  waitTargets: string[];
  readyPolls: string[];
  queueReadiness(...values: boolean[]): void;
  pendingWaits(): number;
  resolveWait(status: AgentStatus): void;
  rejectWait(error: Error): void;
  failNext(method: "startAgent" | "prompt" | "createTab" | "splitPane", error: Error): void;
}

export function fakeClient(): FakeClient {
  const calls: string[] = [];
  const prompts: string[] = [];
  const closedPanes: string[] = [];
  const tabs: CreateTabInput[] = [];
  const agents: StartAgentInput[] = [];
  const waitTargets: string[] = [];
  const readyPolls: string[] = [];
  const readiness: boolean[] = [];
  const waiters: Waiter[] = [];
  const failures = new Map<string, Error>();
  let panes = 0;

  function guard(method: string): void {
    const failure = failures.get(method);
    if (failure !== undefined) {
      failures.delete(method);
      throw failure;
    }
  }

  const client: HerdrClient = {
    async createTab(input) {
      calls.push("createTab");
      guard("createTab");
      tabs.push(input);
      panes += 1;
      return `w1:p${panes}`;
    },
    async createWorktree() {
      calls.push("createWorktree");
      panes += 1;
      return { workspaceId: "w9", tabId: "w9:t1", paneId: `w9:p${panes}`, path: "/tmp/wt" };
    },
    async splitPane() {
      calls.push("splitPane");
      guard("splitPane");
      panes += 1;
      return `w9:p${panes}`;
    },
    async removeWorktree() {
      calls.push("removeWorktree");
    },
    async startAgent(input) {
      calls.push("startAgent");
      guard("startAgent");
      agents.push(input);
    },
    async getAgent(target) {
      calls.push("getAgent");
      readyPolls.push(target);
      return { status: "idle", interactiveReady: readiness.shift() ?? true };
    },
    async prompt(target, text) {
      calls.push("prompt");
      guard("prompt");
      prompts.push(`${target}|${text}`);
    },
    async sendKeys() {
      calls.push("sendKeys");
    },
    async waitAgent(target) {
      calls.push("waitAgent");
      waitTargets.push(target);
      return await new Promise<AgentStatus>((resolve, reject) => {
        waiters.push({ resolve, reject });
      });
    },
    async closePane(paneId) {
      calls.push("closePane");
      closedPanes.push(paneId);
    },
    async listPanes(): Promise<PaneState[]> {
      return [];
    },
    close() {
      calls.push("close");
    },
  };

  return {
    client,
    calls,
    prompts,
    closedPanes,
    tabs,
    agents,
    waitTargets,
    readyPolls,
    queueReadiness(...values) {
      readiness.push(...values);
    },
    pendingWaits: () => waiters.length,
    resolveWait(status) {
      const waiter = waiters.shift();
      if (waiter === undefined) {
        throw new Error("no pending wait");
      }
      waiter.resolve(status);
    },
    rejectWait(error) {
      const waiter = waiters.shift();
      if (waiter === undefined) {
        throw new Error("no pending wait");
      }
      waiter.reject(error);
    },
    failNext(method, error) {
      failures.set(method, error);
    },
  };
}
