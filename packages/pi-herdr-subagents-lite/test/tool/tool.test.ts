import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RunService } from "../../src/run/index.ts";
import { ToolError } from "../../src/run/index.ts";
import { createSubagentTool } from "../../src/tool/index.ts";
import { testConfig } from "../support/config.ts";

function stubService(overrides: Partial<RunService> = {}) {
  const base: RunService = {
    spawn: async () => ({ id: "alpha", status: "running", paneId: "w1:p1", sessionFile: "/s" }),
    steer: async (id) => ({ id, status: "running" }),
    stop: async (id) => ({ id, status: "cancelled" }),
    inspect: () => [],
    onBatch: () => undefined,
    shutdown: () => undefined,
    closeChildren: async () => ({ failed: [] }),
  };
  const service = { ...base, ...overrides };
  return () => service;
}

const tool = (service: () => RunService) =>
  createSubagentTool({ config: testConfig(), service }) as unknown as {
    execute(id: string, params: unknown): Promise<{ content: Array<{ text: string }>; isError: boolean }>;
  };

beforeEach(() => {
  process.env.HERDR_ENV = "1";
});

afterEach(() => {
  delete process.env.HERDR_ENV;
  vi.restoreAllMocks();
});

describe("subagent tool", () => {
  it("returns the spawn envelope as JSON", async () => {
    const result = await tool(stubService()).execute("call", { action: "spawn", id: "alpha", objective: "go" });

    expect(result.isError).toBe(false);
    expect(JSON.parse(result.content[0]?.text ?? "")).toEqual({
      id: "alpha",
      status: "running",
      paneId: "w1:p1",
      sessionFile: "/s",
    });
  });

  it("forwards steer and stop arguments", async () => {
    const steer = vi.fn(async (id: string) => ({ id, status: "running" as const }));
    const stopped = vi.fn(async (id: string) => ({ id, status: "cancelled" as const }));
    const service = stubService({ steer, stop: stopped });

    await tool(service).execute("call", { action: "steer", id: "alpha", message: "left" });
    await tool(service).execute("call", { action: "stop", id: "alpha" });

    expect(steer).toHaveBeenCalledWith("alpha", "left");
    expect(stopped).toHaveBeenCalledWith("alpha");
  });

  it("passes the inspect id through", async () => {
    const inspect = vi.fn(() => []);
    await tool(stubService({ inspect })).execute("call", { action: "inspect", id: "alpha" });

    expect(inspect).toHaveBeenCalledWith("alpha");
  });

  it("turns a tool error into a failure result", async () => {
    const service = stubService({
      spawn: async () => {
        throw new ToolError("duplicate_id", 'a run named "alpha" already exists in this session');
      },
    });

    const result = await tool(service).execute("call", { action: "spawn", id: "alpha", objective: "go" });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toBe('duplicate_id: a run named "alpha" already exists in this session');
  });

  it("refuses to work outside herdr", async () => {
    delete process.env.HERDR_ENV;

    const result = await tool(stubService()).execute("call", { action: "inspect" });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("not_in_herdr");
  });
});
