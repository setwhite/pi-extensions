import { afterEach, describe, expect, it } from "vitest";
import { createHerdrClient, type HerdrClient } from "../../src/herdr/index.ts";
import { type FakeHerdr, startFakeHerdr } from "../support/socket-server.ts";

const cleanups: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  for (const cleanup of cleanups.reverse()) {
    await cleanup();
  }
  cleanups.length = 0;
});

async function clientFor(
  handler: Parameters<typeof startFakeHerdr>[0],
): Promise<{ client: HerdrClient; server: FakeHerdr }> {
  const server = await startFakeHerdr(handler);
  const client = createHerdrClient(server.endpoint);
  cleanups.push(() => server.close());
  cleanups.push(() => client.close());
  return { client, server };
}

const pane = (paneId: string) => ({ result: { type: "pane_info", pane: { pane_id: paneId } } });

describe("herdr client", () => {
  it("reads a standalone wait that matches the current state", async () => {
    const { client } = await clientFor(() => ({
      result: {
        type: "agent_info",
        agent: { pane_id: "w1:p2", name: "alpha", agent_status: "idle" },
      },
    }));

    await expect(client.waitAgent("w1:p2", ["idle", "done", "blocked"])).resolves.toBe("idle");
  });

  it("creates a tab with env and returns the root pane id", async () => {
    const { client, server } = await clientFor(() => ({
      result: { type: "tab_created", tab: { tab_id: "w1:t2" }, root_pane: { pane_id: "w1:p2" } },
    }));

    await expect(client.createTab({ cwd: "/repo", label: "child", env: { PI_SUBAGENT_DEPTH: "1" } })).resolves.toBe(
      "w1:p2",
    );
    expect(server.requests[0]?.params).toMatchObject({
      cwd: "/repo",
      label: "child",
      env: { PI_SUBAGENT_DEPTH: "1" },
      focus: false,
    });
  });

  it("returns the worktree path from worktree.create", async () => {
    const { client } = await clientFor(() => ({
      result: {
        type: "worktree_created",
        workspace: { workspace_id: "w9" },
        tab: { tab_id: "w9:t1" },
        root_pane: { pane_id: "w9:p1" },
        worktree: { path: "/tmp/wt", label: "child" },
      },
    }));

    await expect(client.createWorktree({ cwd: "/repo", label: "child" })).resolves.toEqual({
      workspaceId: "w9",
      tabId: "w9:t1",
      paneId: "w9:p1",
      path: "/tmp/wt",
    });
  });

  it("splits a pane with env and returns the new pane id", async () => {
    const { client, server } = await clientFor(() => pane("w9:p2"));

    await expect(client.splitPane({ paneId: "w9:p1", cwd: "/tmp/wt", env: { A: "1" } })).resolves.toBe("w9:p2");
    expect(server.requests[0]?.params).toMatchObject({
      target_pane_id: "w9:p1",
      direction: "right",
      env: { A: "1" },
    });
  });

  it("starts a pi agent with the given argv", async () => {
    const { client, server } = await clientFor(() => ({
      result: { type: "agent_started", agent: { pane_id: "w1:p2" }, argv: [] },
    }));

    await client.startAgent({ name: "child", paneId: "w1:p2", args: ["--session", "/runs/child/session.jsonl"] });
    expect(server.requests[0]?.params).toMatchObject({
      name: "child",
      kind: "pi",
      pane_id: "w1:p2",
      args: ["--session", "/runs/child/session.jsonl"],
    });
  });

  it("reads the status out of a wait_matched frame", async () => {
    const { client, server } = await clientFor(() => ({
      result: {
        type: "wait_matched",
        event: { event: "pane_agent_status_changed", data: { pane_id: "w1:p2", agent_status: "idle" } },
      },
    }));

    await expect(client.waitAgent("w1:p2", ["idle", "done", "blocked"], 1000)).resolves.toBe("idle");
    expect(server.requests[0]?.params).toMatchObject({
      target: "w1:p2",
      until: ["idle", "done", "blocked"],
      timeout_ms: 1000,
    });
  });

  it("treats a missing pane as already closed", async () => {
    const { client } = await clientFor(() => ({ error: { code: "pane_not_found", message: "gone" } }));

    await expect(client.closePane("w1:p2")).resolves.toBeUndefined();
  });

  it("passes the agent_blocked code through to the caller", async () => {
    const { client } = await clientFor(() => ({ error: { code: "agent_blocked", message: "waiting for input" } }));

    await expect(client.prompt("w1:p2", "go")).rejects.toMatchObject({ code: "agent_blocked" });
  });
});
