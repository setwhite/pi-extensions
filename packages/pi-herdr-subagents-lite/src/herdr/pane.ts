import { type ExecHerdr, type HerdrCall, HerdrHostError } from "./cli.ts";

export interface CreatedTab {
  tabId: string;
  paneId: string;
}

export interface CreateTabInput {
  cwd: string;
  label: string;
}

export interface CreateWorkspaceInput {
  cwd: string;
  label: string;
}

export interface CreatedWorkspace extends CreatedTab {
  workspaceId: string;
}

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
}

interface PaneInfo {
  pane_id: string;
}

export function createPaneCommands(exec: ExecHerdr) {
  return {
    async createWorkspace({ cwd, label }: CreateWorkspaceInput, call: HerdrCall = {}): Promise<CreatedWorkspace> {
      const result = await exec<{ workspace: WorkspaceInfo; tab: TabInfo; root_pane: PaneInfo }>(
        ["workspace", "create", "--cwd", cwd, "--label", label, "--no-focus"],
        { kind: "mutation", signal: call.signal },
      );
      return {
        workspaceId: result.workspace.workspace_id,
        tabId: result.tab.tab_id,
        paneId: result.root_pane.pane_id,
      };
    },

    async createTab({ cwd, label }: CreateTabInput, call: HerdrCall = {}): Promise<CreatedTab> {
      const result = await exec<{ tab: TabInfo; root_pane: PaneInfo }>(
        ["tab", "create", "--cwd", cwd, "--label", label, "--no-focus"],
        { kind: "mutation", signal: call.signal },
      );
      return { tabId: result.tab.tab_id, paneId: result.root_pane.pane_id };
    },

    async renameTab({ tabId, label }: RenameTabInput, call: HerdrCall = {}) {
      await exec(["tab", "rename", tabId, label], { kind: "mutation", signal: call.signal });
    },

    async renamePane({ paneId, label }: RenamePaneInput, call: HerdrCall = {}) {
      await exec(["pane", "rename", paneId, label], { kind: "mutation", signal: call.signal });
    },

    async hasPane(paneId: string, call: HerdrCall = {}): Promise<boolean> {
      const result = await exec<{ panes: PaneInfo[] }>(["pane", "list"], { kind: "query", signal: call.signal });
      return result.panes.some((pane) => pane.pane_id === paneId);
    },

    // 只关自己记下的 pane，不看 tab 里还有什么。pane 已经不在了也算关掉。
    async closePane(paneId: string, call: HerdrCall = {}): Promise<void> {
      try {
        await exec(["pane", "close", paneId], { kind: "mutation", signal: call.signal });
      } catch (error) {
        if (!(error instanceof HerdrHostError && error.code === "pane_not_found")) {
          throw error;
        }
      }
    },
  };
}
