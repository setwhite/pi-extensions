import type { RequestOptions, Transport } from "./socket.ts";
import { createTransport, HerdrError } from "./socket.ts";

export { socketEndpoint } from "./endpoint.ts";
export type { Transport };
export { HerdrError };

export type AgentStatus = "idle" | "working" | "blocked" | "done" | "unknown";

export interface PaneState {
  paneId: string;
  agentStatus: AgentStatus;
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
  prompt(target: string, text: string): Promise<void>;
  sendKeys(target: string, keys: string[]): Promise<void>;
  waitAgent(target: string, until: AgentStatus[], timeoutMs?: number): Promise<AgentStatus>;
  closePane(paneId: string): Promise<void>;
  listPanes(): Promise<PaneState[]>;
  close(): void;
}

const QUERY_MS = 20_000;
const MUTATION_MS = 120_000;

function resultOf(value: unknown, type: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    throw new HerdrError("herdr_protocol", `empty result, expected ${type}`);
  }
  const record = value as Record<string, unknown>;
  if (record.type !== type) {
    throw new HerdrError("herdr_protocol", `expected ${type}, got ${String(record.type)}`);
  }
  return record;
}

function nested(record: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = record[key];
  if (typeof value !== "object" || value === null) {
    throw new HerdrError("herdr_protocol", `${key}: expected object`);
  }
  return value as Record<string, unknown>;
}

function text(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value === "") {
    throw new HerdrError("herdr_protocol", `${key}: expected non-empty string`);
  }
  return value;
}

export function createHerdrClient(endpoint: string): HerdrClient {
  const transport: Transport = createTransport(endpoint);

  const call = (method: string, params: Record<string, unknown>, options: RequestOptions): Promise<unknown> =>
    transport.request(method, params, options);

  return {
    async createTab({ cwd, label, env, workspaceId }) {
      const params: Record<string, unknown> = { cwd, label, env, focus: false };
      if (workspaceId !== undefined) {
        params.workspace_id = workspaceId;
      }
      const result = resultOf(await call("tab.create", params, { timeoutMs: MUTATION_MS }), "tab_created");
      return text(nested(result, "root_pane"), "pane_id");
    },

    async createWorktree({ cwd, label }) {
      const result = resultOf(
        await call("worktree.create", { cwd, label, focus: false }, { timeoutMs: MUTATION_MS }),
        "worktree_created",
      );
      return {
        workspaceId: text(nested(result, "workspace"), "workspace_id"),
        tabId: text(nested(result, "tab"), "tab_id"),
        paneId: text(nested(result, "root_pane"), "pane_id"),
        path: text(nested(result, "worktree"), "path"),
      };
    },

    async splitPane({ paneId, cwd, env }) {
      const result = resultOf(
        await call(
          "pane.split",
          { target_pane_id: paneId, direction: "right", cwd, env, focus: false },
          { timeoutMs: MUTATION_MS },
        ),
        "pane_info",
      );
      return text(nested(result, "pane"), "pane_id");
    },

    async removeWorktree(workspaceId) {
      await call("worktree.remove", { workspace_id: workspaceId, force: true }, { timeoutMs: MUTATION_MS });
    },

    async startAgent({ name, paneId, args }) {
      await call(
        "agent.start",
        { name, kind: "pi", pane_id: paneId, args, timeout_ms: 60_000 },
        { timeoutMs: MUTATION_MS },
      );
    },

    async prompt(target, promptText) {
      await call("agent.prompt", { target, text: promptText }, { timeoutMs: MUTATION_MS });
    },

    async sendKeys(target, keys) {
      await call("agent.send_keys", { target, keys }, { timeoutMs: MUTATION_MS });
    },

    async waitAgent(target, until, timeoutMs) {
      const params: Record<string, unknown> = { target, until };
      const options: RequestOptions = {};
      if (timeoutMs !== undefined) {
        params.timeout_ms = timeoutMs;
        // 客户端比服务端多等一会，避免两边同时超时后分不清是谁先放弃。
        options.timeoutMs = timeoutMs + 5000;
      }
      const raw = await call("agent.wait", params, options);
      // 当前状态已经匹配时 herdr 不推事件，直接回 agent_info。
      const result =
        typeof raw === "object" && raw !== null && (raw as Record<string, unknown>).type === "agent_info"
          ? resultOf(raw, "agent_info")
          : resultOf(raw, "wait_matched");
      const holder = result.type === "agent_info" ? nested(result, "agent") : nested(nested(result, "event"), "data");
      const status = holder.agent_status;
      if (typeof status !== "string") {
        throw new HerdrError("herdr_protocol", "agent.wait: missing agent_status");
      }
      return status as AgentStatus;
    },

    async closePane(paneId) {
      try {
        await call("pane.close", { pane_id: paneId }, { timeoutMs: MUTATION_MS });
      } catch (error) {
        if (!(error instanceof HerdrError) || error.code !== "pane_not_found") {
          throw error;
        }
      }
    },

    async listPanes() {
      const result = resultOf(await call("pane.list", {}, { timeoutMs: QUERY_MS }), "pane_list");
      const panes = Array.isArray(result.panes) ? result.panes : [];
      return panes.map((pane) => {
        const record = pane as Record<string, unknown>;
        return { paneId: text(record, "pane_id"), agentStatus: (record.agent_status ?? "unknown") as AgentStatus };
      });
    },

    close() {
      transport.close();
    },
  };
}
