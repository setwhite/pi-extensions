import type { AgentEntry, AgentSnapshot, StartAgentInput } from "./agent.ts";
import { createAgentCommands } from "./agent.ts";
import { createHerdrExec, HerdrHostError } from "./cli.ts";
import type {
  CloseTabInput,
  CloseTabResult,
  CreatedTab,
  CreatedWorkspace,
  CreateTabInput,
  CreateWorkspaceInput,
  RenamePaneInput,
  RenameTabInput,
} from "./pane.ts";
import { createPaneCommands } from "./pane.ts";

export { HerdrHostError };

export interface HerdrHost {
  createWorkspace(input: CreateWorkspaceInput): Promise<CreatedWorkspace>;
  createTab(input: CreateTabInput): Promise<CreatedTab>;
  renameTab(input: RenameTabInput): Promise<void>;
  renamePane(input: RenamePaneInput): Promise<void>;
  startAgent(input: StartAgentInput): Promise<void>;
  hasPane(paneId: string): Promise<boolean>;
  listAgents(): Promise<AgentEntry[]>;
  closeTabIfOnlyPane(input: CloseTabInput): Promise<CloseTabResult>;
}

export type { AgentEntry, AgentSnapshot, CloseTabResult, StartAgentInput };

export function createHerdrHost(bin: string): HerdrHost {
  const { execJson } = createHerdrExec(bin);
  return { ...createPaneCommands(execJson), ...createAgentCommands(execJson) };
}
