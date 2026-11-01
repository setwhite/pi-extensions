// 一个 named herdr session 的 CLI 客户端：查询 tab/pane/agent，给 pane 打字。

import { HERDR_BIN } from "./prereq.ts";
import { run, sleep } from "./process.ts";

export interface TabInfo {
  tab_id: string;
  label: string;
  pane_count: number;
}

export interface PaneInfo {
  pane_id: string;
  tab_id: string;
}

export interface AgentInfo {
  name?: string;
  pane_id: string;
  agent_status: string;
  completion_seq?: number;
}

export class HerdrCallError extends Error {
  readonly code: string | undefined;

  constructor(args: string[], code: string | undefined, message: string | undefined) {
    super(`herdr ${args.join(" ")}: ${code ?? ""} ${message ?? ""}`.trim());
    this.name = "HerdrCallError";
    this.code = code;
  }
}

export class HerdrSession {
  readonly sessionName: string;
  workspaceId = "";
  protected readonly env: NodeJS.ProcessEnv;
  private readonly cwd: string;

  constructor(sessionName: string, env: NodeJS.ProcessEnv, cwd: string) {
    this.sessionName = sessionName;
    this.env = env;
    this.cwd = cwd;
  }

  async call(args: string[]): Promise<unknown> {
    const text = await run(HERDR_BIN as string, ["--session", this.sessionName, ...args], {
      env: this.env,
      cwd: this.cwd,
    });
    if (text.trim() === "") {
      return undefined;
    }
    const parsed = JSON.parse(text.trim()) as { result?: unknown; error?: { code?: string; message?: string } };
    if (parsed.error) {
      throw new HerdrCallError(args, parsed.error.code, parsed.error.message);
    }
    return parsed.result;
  }

  async createWorkspace(cwd: string): Promise<void> {
    const created = (await this.call(["workspace", "create", "--label", "e2e", "--cwd", cwd])) as {
      workspace: { workspace_id: string };
    };
    this.workspaceId = created.workspace.workspace_id;
  }

  async tabs(): Promise<TabInfo[]> {
    const result = (await this.call(["tab", "list"])) as { tabs: TabInfo[] };
    return result.tabs;
  }

  async panes(): Promise<PaneInfo[]> {
    const result = (await this.call(["pane", "list", "--workspace", this.workspaceId])) as { panes: PaneInfo[] };
    return result.panes;
  }

  async agents(): Promise<AgentInfo[]> {
    const result = (await this.call(["agent", "list"])) as { agents: AgentInfo[] };
    return result.agents;
  }

  async tabFor(label: string): Promise<TabInfo | undefined> {
    return (await this.tabs()).find((tab) => tab.label === label);
  }

  async childPid(paneId: string): Promise<number> {
    const info = (await this.call(["pane", "process-info", "--pane", paneId])) as {
      process_info: { foreground_processes: Array<{ pid: number; argv0: string }> };
    };
    const found = info.process_info.foreground_processes.find((process) => /(^|[\\/])pi(\.exe)?$/i.test(process.argv0));
    if (!found) {
      throw new Error(`no pi process in pane ${paneId}`);
    }
    return found.pid;
  }

  async type(paneId: string, text: string): Promise<void> {
    await this.call(["pane", "send-text", paneId, text]);
    await sleep(300);
    await this.call(["pane", "send-keys", paneId, "enter"]);
  }

  async prompt(agent: string, text: string): Promise<void> {
    await this.call(["agent", "prompt", agent, text]);
  }
}
