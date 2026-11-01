import { type ExecHerdr, HerdrHostError } from "./cli.ts";

export interface CreatedTab {
  tabId: string;
  paneId: string;
}

export interface CreateTabInput {
  cwd: string;
  label: string;
  env: Record<string, string>;
}

export interface CreateWorkspaceInput {
  cwd: string;
  label: string;
  env: Record<string, string>;
}

export interface CreatedWorkspace extends CreatedTab {
  workspaceId: string;
}

function envArgs(env: Record<string, string>): string[] {
  return Object.entries(env).flatMap(([key, value]) => ["--env", `${key}=${value}`]);
}

export interface CloseTabInput {
  tabId: string;
  paneId: string;
}

export type CloseTabResult = "closed" | "kept" | "missing";

export interface RenameTabInput {
  tabId: string;
  label: string;
}

export interface RenamePaneInput {
  paneId: string;
  label: string;
}

interface WorkspaceInfo {
  workspace_id: string;
}

interface TabInfo {
  tab_id: string;
  workspace_id: string;
  pane_count: number;
}

interface PaneInfo {
  pane_id: string;
  tab_id: string;
}

export function createPaneCommands(exec: ExecHerdr) {
  return {
    async createWorkspace({ cwd, label, env }: CreateWorkspaceInput): Promise<CreatedWorkspace> {
      const result = await exec<{ workspace: WorkspaceInfo; tab: TabInfo; root_pane: PaneInfo }>([
        "workspace",
        "create",
        "--cwd",
        cwd,
        "--label",
        label,
        ...envArgs(env),
        "--no-focus",
      ]);
      return {
        workspaceId: result.workspace.workspace_id,
        tabId: result.tab.tab_id,
        paneId: result.root_pane.pane_id,
      };
    },

    async createTab({ cwd, label, env }: CreateTabInput): Promise<CreatedTab> {
      const result = await exec<{ tab: TabInfo; root_pane: PaneInfo }>([
        "tab",
        "create",
        "--cwd",
        cwd,
        "--label",
        label,
        ...envArgs(env),
        "--no-focus",
      ]);
      return { tabId: result.tab.tab_id, paneId: result.root_pane.pane_id };
    },

    async renameTab({ tabId, label }: RenameTabInput) {
      await exec(["tab", "rename", tabId, label]);
    },

    async renamePane({ paneId, label }: RenamePaneInput) {
      await exec(["pane", "rename", paneId, label]);
    },

    async hasPane(paneId: string): Promise<boolean> {
      const result = await exec<{ panes: PaneInfo[] }>(["pane", "list"]);
      return result.panes.some((pane) => pane.pane_id === paneId);
    },

    async closeTabIfOnlyPane({ tabId, paneId }: CloseTabInput): Promise<CloseTabResult> {
      try {
        const { tab } = await exec<{ tab: TabInfo }>(["tab", "get", tabId]);
        if (tab.pane_count !== 1) {
          return "kept";
        }
        const panes = await exec<{ panes: PaneInfo[] }>(["pane", "list", "--workspace", tab.workspace_id]);
        const tabPanes = panes.panes.filter((pane) => pane.tab_id === tabId);
        if (tabPanes.length !== 1 || tabPanes[0]?.pane_id !== paneId) {
          return "kept";
        }
        await exec(["tab", "close", tabId]);
        return "closed";
      } catch (error) {
        if (error instanceof HerdrHostError && error.code === "tab_not_found") {
          return "missing";
        }
        throw error;
      }
    },
  };
}
