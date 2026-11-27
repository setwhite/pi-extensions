import { MUTATION_MS, nested, QUERY_MS, resultOf, text } from "./parse.ts";
import type { RequestOptions, Transport } from "./socket.ts";
import { createTransport, HerdrError } from "./socket.ts";
import type { AgentStatus, HerdrClient } from "./types.ts";

export { socketEndpoint } from "./endpoint.ts";
export type {
  AgentState,
  AgentStatus,
  CreatedWorktree,
  CreateTabInput,
  HerdrClient,
  PaneState,
  SplitPaneInput,
  StartAgentInput,
} from "./types.ts";
export type { Transport };
export { HerdrError };

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

    async getAgent(target) {
      // agent.get 是唯一会推进 herdr 启动状态的查询：agent.list 不碰 reconcile。
      const result = resultOf(await call("agent.get", { target }, { timeoutMs: QUERY_MS }), "agent_info");
      const holder = nested(result, "agent");
      const status = holder.agent_status;
      if (typeof status !== "string") {
        throw new HerdrError("herdr_protocol", "agent.get: missing agent_status");
      }
      return { status: status as AgentStatus, interactiveReady: holder.interactive_ready === true };
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
