// 父代理：清掉同名旧代理，等 pane 变成可用 shell 再 start。
import { rmSync } from "node:fs";
import { join } from "node:path";
import { closeChildren } from "./children.ts";
import { HerdrCallError, type HerdrSession } from "./herdr-session.ts";
import { killProcess, waitFor } from "./process.ts";

const PI_ARGS = ["--no-skills", "--no-prompt-templates", "--no-context-files", "--no-mcp", "--tools", "subagent"];

export interface ParentOptions {
  agentDir: string;
  project: string;
  name: string;
}

export interface ParentHandle {
  sessionFile: string;
  paneId: string;
}

export async function startParent(session: HerdrSession, options: ParentOptions): Promise<ParentHandle> {
  await clearParent(session, options.agentDir, options.name);
  const sessionFile = join(options.agentDir, "sessions", `${options.name}.jsonl`);
  const tab = (await session.call([
    "tab",
    "create",
    "--workspace",
    session.workspaceId,
    "--cwd",
    options.project,
    "--no-focus",
  ])) as { root_pane: { pane_id: string } };
  const paneId = tab.root_pane.pane_id;
  await startAgent(session, options.name, paneId, sessionFile);
  return { sessionFile, paneId };
}

// 新建的 tab 里 shell 还没就绪时 herdr 回 agent_pane_busy；等到它成为可用 shell。
async function startAgent(session: HerdrSession, name: string, paneId: string, sessionFile: string): Promise<void> {
  await waitFor(
    async () => {
      try {
        await session.call([
          "agent",
          "start",
          name,
          "--kind",
          "pi",
          "--pane",
          paneId,
          "--timeout",
          "30000",
          "--",
          ...PI_ARGS,
          "--session",
          sessionFile,
        ]);
        return true;
      } catch (error) {
        if (error instanceof HerdrCallError && error.code === "agent_pane_busy") {
          return false;
        }
        throw error;
      }
    },
    `pane ${paneId} to become an available shell`,
    30_000,
  );
}

// 重试同一测试时上一次的 parent 还在：关掉它的 tab、删掉旧 session 文件，名字才能复用。
async function clearParent(session: HerdrSession, agentDir: string, name: string): Promise<void> {
  await closeChildren(session);
  const stale = (await session.agents()).find((agent) => agent.name === name);
  if (stale !== undefined) {
    const pane = (await session.panes()).find((entry) => entry.pane_id === stale.pane_id);
    if (pane !== undefined) {
      try {
        killProcess(await session.childPid(stale.pane_id));
      } catch {
        // pane 里已经没有 pi。
      }
      try {
        await session.call(["tab", "close", pane.tab_id]);
      } catch {
        // tab 可能已自行关闭。
      }
    }
    await waitFor(
      async () => (await session.agents()).every((agent) => agent.name !== name),
      `${name} to disappear`,
      30_000,
    );
  }
  rmSync(join(agentDir, "sessions", `${name}.jsonl`), { force: true });
}
