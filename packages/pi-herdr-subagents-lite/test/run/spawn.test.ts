import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { HerdrError } from "../../src/herdr/index.ts";
import { cleanupRuns, setupRun } from "../support/run-env.ts";

afterEach(async () => {
  await cleanupRuns();
});

describe("spawn", () => {
  it("creates a depth-marked pane and prompts the child", async () => {
    const { service, fake, runsDir, sessionsDir } = setupRun();

    const spawned = await service.spawn({ id: "alpha", objective: "list the files", context: "repo root" });

    expect(spawned).toMatchObject({
      id: "alpha",
      status: "running",
      paneId: "w1:p1",
      sessionFile: join(sessionsDir, "alpha", "session.jsonl"),
      runDir: join(runsDir, "alpha"),
    });
    expect(fake.tabs[0]).toEqual({
      cwd: process.cwd(),
      label: "alpha",
      env: {
        PI_SUBAGENT_DEPTH: "1",
        PI_SUBAGENT_ID: "alpha",
        PI_SUBAGENT_RUN_DIR: join(runsDir, "alpha"),
      },
    });
    const args = fake.agents[0]?.args ?? [];
    expect(args).toContain("--exclude-tools");
    expect(args[args.indexOf("--exclude-tools") + 1]).toBe("ask");
    expect(args).toContain(join(sessionsDir, "alpha", "session.jsonl"));
    expect(fake.prompts[0]).toContain("# Objective");
    expect(fake.prompts[0]).toContain("list the files");
    expect(fake.prompts[0]).toContain("repo root");
    expect(service.inspect("alpha")[0]?.status).toBe("running");
    service.shutdown();
  });

  it("keeps the child session out of the run directory", async () => {
    const { service, runsDir, sessionsDir } = setupRun();

    await service.spawn({ id: "alpha", objective: "x" });
    const [view] = service.inspect("alpha");

    expect(view).toMatchObject({
      sessionFile: join(sessionsDir, "alpha", "session.jsonl"),
      runDir: join(runsDir, "alpha"),
    });
    expect(view?.sessionFile.startsWith(view.runDir)).toBe(false);
    service.shutdown();
  });

  it("forwards the optional tool and model selections", async () => {
    const { service, fake } = setupRun();

    await service.spawn({
      id: "beta",
      objective: "x",
      tools: ["read", "bash"],
      model: "opencode-go/kimi",
      thinking: "high",
    });

    const args = fake.agents[0]?.args ?? [];
    expect(args[args.indexOf("--tools") + 1]).toBe("read,bash");
    expect(args[args.indexOf("--model") + 1]).toBe("opencode-go/kimi");
    expect(args[args.indexOf("--thinking") + 1]).toBe("high");
    service.shutdown();
  });

  it("derives --exclude-tools from config", async () => {
    const joined = setupRun({ excludeTools: ["ask", "todo"] });
    await joined.service.spawn({ id: "alpha", objective: "x" });
    const args = joined.fake.agents[0]?.args ?? [];
    expect(args[args.indexOf("--exclude-tools") + 1]).toBe("ask,todo");
    joined.service.shutdown();

    const none = setupRun({ excludeTools: [] });
    await none.service.spawn({ id: "alpha", objective: "x" });
    expect(none.fake.agents[0]?.args ?? []).not.toContain("--exclude-tools");
    none.service.shutdown();
  });

  it("polls agent.get until herdr reports the agent interactive, then prompts once", async () => {
    const { service, fake } = setupRun();
    fake.queueReadiness(false, false, true);

    const spawned = await service.spawn({ id: "alpha", objective: "do the thing" });

    expect(spawned.status).toBe("running");
    expect(fake.readyPolls).toEqual(["w1:p1", "w1:p1", "w1:p1"]);
    expect(fake.prompts).toHaveLength(1);
    service.shutdown();
  });

  it("retries the prompt until herdr registers the agent", async () => {
    const { service, fake } = setupRun();
    fake.failNext("prompt", new HerdrError("agent_not_ready", "agent w1:p1 is not an active named agent"));

    const spawned = await service.spawn({ id: "alpha", objective: "do the thing" });

    expect(spawned.status).toBe("running");
    expect(fake.prompts).toHaveLength(1);
    expect(fake.prompts[0]).toContain("do the thing");
    service.shutdown();
  });

  it("rejects a duplicate id", async () => {
    const { service } = setupRun();
    await service.spawn({ id: "alpha", objective: "x" });

    await expect(service.spawn({ id: "alpha", objective: "y" })).rejects.toMatchObject({ code: "duplicate_id" });
    service.shutdown();
  });

  it("rejects an id that breaks the pattern", async () => {
    const { service } = setupRun();

    await expect(service.spawn({ id: "Alpha", objective: "x" })).rejects.toMatchObject({ code: "invalid_id" });
    service.shutdown();
  });

  it("rejects a spawn once every slot is taken", async () => {
    const { service } = setupRun({ maxConcurrent: 1 });
    await service.spawn({ id: "alpha", objective: "x" });

    await expect(service.spawn({ id: "beta", objective: "y" })).rejects.toMatchObject({ code: "max_concurrent" });
    service.shutdown();
  });

  it("creates an isolated worktree and a pane inside it", async () => {
    const { service, fake } = setupRun();

    const spawned = await service.spawn({ id: "alpha", objective: "x", worktree: true });

    expect(spawned.worktree).toBe("/tmp/wt");
    expect(fake.calls.slice(0, 4)).toEqual(["createWorktree", "splitPane", "closePane", "startAgent"]);
    // 关掉 worktree workspace 里原来的空 shell，只留下带 env 的子 pane。
    expect(fake.closedPanes).toEqual(["w9:p1"]);
    service.shutdown();
  });

  it("removes the orphan worktree when the agent never starts", async () => {
    const { service, fake } = setupRun();
    fake.failNext("startAgent", new Error("agent_not_ready"));

    const failure = await service.spawn({ id: "alpha", objective: "x", worktree: true }).catch((error: Error) => error);

    expect(failure).toMatchObject({ code: "spawn_failed" });
    expect((failure as Error).message).not.toContain("Pane:");
    expect((failure as Error).message).not.toContain("w9:p2");
    expect(fake.calls).toContain("removeWorktree");
    expect(fake.closedPanes).toEqual(["w9:p1", "w9:p2"]);
    expect(service.inspect("alpha")).toEqual([]);
    service.shutdown();
  });

  it("keeps the record out of the table when the tab cannot be created", async () => {
    const { service, fake } = setupRun();
    fake.failNext("createTab", new Error("herdr unavailable"));

    await expect(service.spawn({ id: "alpha", objective: "x" })).rejects.toMatchObject({ code: "spawn_failed" });
    expect(service.inspect("alpha")).toEqual([]);
    service.shutdown();
  });
});
