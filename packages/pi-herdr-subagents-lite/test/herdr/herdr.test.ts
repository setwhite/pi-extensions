import { expect, it } from "vitest";
import { type ExecHerdr, HerdrHostError } from "../../src/herdr/cli.ts";
import { createPaneCommands } from "../../src/herdr/pane.ts";

const result = {
  workspace: { workspace_id: "w1" },
  tab: { tab_id: "w1:t2", workspace_id: "w1", pane_count: 1 },
  root_pane: { pane_id: "w1:p2", tab_id: "w1:t2" },
};

function fakeCommands() {
  const calls: string[][] = [];
  const exec: ExecHerdr = async <T>(args: string[]): Promise<T> => {
    calls.push(args);
    return result as unknown as T;
  };
  return { calls, commands: createPaneCommands(exec) };
}

it("creates a workspace and returns its first tab", async () => {
  const { calls, commands } = fakeCommands();

  await expect(commands.createWorkspace({ cwd: "/repo", label: "explore-1" })).resolves.toEqual({
    workspaceId: "w1",
    tabId: "w1:t2",
    paneId: "w1:p2",
  });
  expect(calls).toEqual([["workspace", "create", "--cwd", "/repo", "--label", "explore-1", "--no-focus"]]);
});

it("closes a pane by id", async () => {
  const { calls, commands } = fakeCommands();

  await commands.closePane("w1:p2");

  expect(calls).toEqual([["pane", "close", "w1:p2"]]);
});

it("treats a pane that is already gone as closed", async () => {
  const exec: ExecHerdr = async () => {
    throw new HerdrHostError("pane_not_found", "pane w1:p2 not found");
  };

  await expect(createPaneCommands(exec).closePane("w1:p2")).resolves.toBeUndefined();
});

it("rethrows other close failures", async () => {
  const exec: ExecHerdr = async () => {
    throw new HerdrHostError("herdr_failed", "herdr did not answer");
  };

  await expect(createPaneCommands(exec).closePane("w1:p2")).rejects.toThrow("herdr did not answer");
});

it("creates a tab in the current workspace", async () => {
  const { calls, commands } = fakeCommands();

  await expect(commands.createTab({ cwd: "/repo", label: "explore-1" })).resolves.toEqual({
    tabId: "w1:t2",
    paneId: "w1:p2",
  });
  expect(calls).toEqual([["tab", "create", "--cwd", "/repo", "--label", "explore-1", "--no-focus"]]);
});
