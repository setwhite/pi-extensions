import { rm, writeFile } from "node:fs/promises";
import { HerdrHostError } from "../herdr/index.ts";
import { createInbox, enqueue, removeInbox } from "../inbox/index.ts";
import type { Profile } from "../profile/index.ts";
import { cancelled, shouldCancel, ToolError } from "./errors.ts";
import type { RunFiles } from "./paths.ts";
import { agentArgs, briefText } from "./spawn-args.ts";
import type { RunPane, RunRecord, RunState } from "./state.ts";

const NAME_ATTEMPTS = 100;

export interface AgentLaunch {
  profile: Profile;
  task: string;
  pane: RunPane;
  files(name: string): RunFiles;
  skillPaths: string[] | undefined;
  signal: AbortSignal | undefined;
}

// 名字冲突就换名重来：pane 已经建好，只改 tab label 与文件前缀。
export async function startAgentWithRetry(state: RunState, run: RunRecord, launch: AgentLaunch): Promise<void> {
  const { profile, task, pane, files, skillPaths, signal } = launch;
  const call = signal === undefined ? undefined : { signal };
  let current = files(run.name);
  for (let retry = 1; ; retry += 1) {
    if (shouldCancel(state, signal)) {
      throw cancelled();
    }
    await writeFile(current.briefFile, briefText(profile, task), "utf8");
    if (profile.systemPrompt !== "task") {
      await writeFile(current.identityFile, profile.body, "utf8");
    }
    createInbox(current.runBase);
    try {
      await state.host.startAgent(
        {
          name: run.name,
          paneId: pane.paneId,
          sessionFile: current.sessionFile,
          agentArgs: agentArgs(profile, current.identityFile, state.toolName, skillPaths),
        },
        call,
      );
      // `agent start` 等到 idle 才算就绪，先入队会让第一轮抢跑并把它拖到超时（DEC-0023）。
      enqueue(current.runBase, `@${current.briefFile}`);
      return;
    } catch (error) {
      if (!(error instanceof HerdrHostError && error.code === "name_taken")) {
        throw error;
      }
      await Promise.all([
        rm(current.briefFile, { force: true }),
        rm(current.identityFile, { force: true }),
        removeInbox(current.runBase),
      ]);
      if (retry >= NAME_ATTEMPTS) {
        throw new ToolError(
          "name_exhausted",
          `no free name for profile "${profile.name}" after ${NAME_ATTEMPTS} attempts`,
        );
      }
      run.name = state.nextName(profile.name);
      await state.host.renameTab({ tabId: pane.tabId, label: run.name }, call);
      current = files(run.name);
      run.sessionFile = current.sessionFile;
      run.runBase = current.runBase;
    }
  }
}
