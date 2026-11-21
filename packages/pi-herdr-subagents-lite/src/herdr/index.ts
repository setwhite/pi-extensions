import type { AgentEntry, AgentSnapshot, StartAgentInput } from "./agent.ts";
import { createAgentCommands } from "./agent.ts";
import { createHerdrExec, type HerdrCall, HerdrHostError } from "./cli.ts";
import type {
  CreatedTab,
  CreatedWorkspace,
  CreateTabInput,
  CreateWorkspaceInput,
  RenamePaneInput,
  RenameTabInput,
} from "./pane.ts";
import { createPaneCommands } from "./pane.ts";

export type { HerdrCall };
export { HerdrHostError };

export interface HerdrHost {
  createWorkspace(input: CreateWorkspaceInput, call?: HerdrCall): Promise<CreatedWorkspace>;
  createTab(input: CreateTabInput, call?: HerdrCall): Promise<CreatedTab>;
  renameTab(input: RenameTabInput, call?: HerdrCall): Promise<void>;
  renamePane(input: RenamePaneInput, call?: HerdrCall): Promise<void>;
  startAgent(input: StartAgentInput, call?: HerdrCall): Promise<void>;
  hasPane(paneId: string, call?: HerdrCall): Promise<boolean>;
  listAgents(call?: HerdrCall): Promise<AgentEntry[]>;
  closePane(paneId: string, call?: HerdrCall): Promise<void>;
}

export type { AgentEntry, AgentSnapshot, StartAgentInput };

export function createHerdrHost(bin: string): HerdrHost {
  const { execJson } = createHerdrExec(bin);
  return { ...createPaneCommands(execJson), ...createAgentCommands(execJson) };
}
