export type AgentStatus = "idle" | "working" | "blocked" | "done" | "unknown";

export interface PaneState {
  paneId: string;
  agentStatus: AgentStatus;
}

/** herdr 的启动就绪状态：interactive_ready 只有在 agent.get 里才会被推进。 */
export interface AgentState {
  status: AgentStatus;
  interactiveReady: boolean;
}

export interface CreateTabInput {
  cwd: string;
  label: string;
  env: Record<string, string>;
  workspaceId?: string;
}

export interface CreatedWorktree {
  workspaceId: string;
  tabId: string;
  paneId: string;
  path: string;
}

export interface SplitPaneInput {
  paneId: string;
  cwd: string;
  env: Record<string, string>;
}

export interface StartAgentInput {
  name: string;
  paneId: string;
  args: string[];
}

/** 扩展唯一的 herdr 依赖面。run 模块只认这个接口。 */
export interface HerdrClient {
  createTab(input: CreateTabInput): Promise<string>;
  createWorktree(input: { cwd: string; label: string }): Promise<CreatedWorktree>;
  splitPane(input: SplitPaneInput): Promise<string>;
  removeWorktree(workspaceId: string): Promise<void>;
  startAgent(input: StartAgentInput): Promise<void>;
  getAgent(target: string): Promise<AgentState>;
  prompt(target: string, text: string): Promise<void>;
  sendKeys(target: string, keys: string[]): Promise<void>;
  waitAgent(target: string, until: AgentStatus[], timeoutMs?: number): Promise<AgentStatus>;
  closePane(paneId: string): Promise<void>;
  listPanes(): Promise<PaneState[]>;
  close(): void;
}
