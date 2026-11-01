import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { HerdrHostError } from "../herdr/index.ts";
import { createInbox, enqueue, removeInbox } from "../inbox/index.ts";
import { spawnFailed, ToolError } from "./errors.ts";
import { paneLabel } from "./naming.ts";
import { createPane } from "./pane.ts";
import { wake } from "./poll.ts";
import { resolveProfile, resolveSkills } from "./resolve.ts";
import { requireSlot } from "./slot.ts";
import { agentArgs, briefText, resolveCwd } from "./spawn-args.ts";
import type { RunRecord, RunState } from "./state.ts";

const NAME_ATTEMPTS = 100;

export interface RunStarted {
  state: "running";
  name: string;
  paneId: string;
  sessionFile: string;
}

function cancelled(): ToolError {
  return new ToolError("spawn_failed", "the session is shutting down; the run was cancelled");
}

export function start(state: RunState, profileName: string, task: string, rawCwd?: string): Promise<RunStarted> {
  const work = launch(state, profileName, task, rawCwd);
  state.pending.add(work);
  const settle = () => state.pending.delete(work);
  work.then(settle, settle);
  return work;
}

async function launch(state: RunState, profileName: string, task: string, rawCwd?: string): Promise<RunStarted> {
  if (state.stopped) {
    throw cancelled();
  }
  const profile = resolveProfile(state.loadProfiles(), profileName);
  requireSlot(state);

  const runId = randomUUID();
  const files = (name: string) => {
    const sessionFile = join(state.sessionsDir, `${name}-${runId}.jsonl`);
    return {
      sessionFile,
      briefFile: `${sessionFile}.brief.md`,
      identityFile: `${sessionFile}.identity.md`,
    };
  };
  const name = state.nextName(profileName);
  let current = files(name);
  const cwd = resolveCwd(rawCwd);
  const run: RunRecord = {
    name,
    profileName: profile.name,
    pane: undefined,
    paneLabel: "",
    sessionFile: current.sessionFile,
    cwd,
    autoExit: profile.autoExit,
    lastHandledSeq: 0,
    lastDeliveredText: null,
    artifactSeq: 0,
    pollFailures: 0,
    busy: false,
    live: true,
  };
  // 先占槽再 await：并发的 run() 必须立刻看到它。
  state.runs.push(run);

  try {
    const skillPaths = await resolveSkills(profile, cwd, state.trusted);
    run.paneLabel = paneLabel(task) || run.name;
    run.pane = await createPane(state, run, cwd, run.paneLabel);
    await mkdir(state.sessionsDir, { recursive: true });

    for (let retry = 1; ; retry++) {
      if (state.stopped) {
        throw cancelled();
      }
      await writeFile(current.briefFile, briefText(profile, task), "utf8");
      if (profile.systemPrompt !== "task") {
        await writeFile(current.identityFile, profile.body, "utf8");
      }
      await createInbox(current.sessionFile);
      try {
        await state.host.startAgent({
          name: run.name,
          paneId: run.pane.paneId,
          sessionFile: current.sessionFile,
          agentArgs: agentArgs(profile, current.identityFile, state.toolName, skillPaths),
        });
        // `agent start` 等到 idle 才算就绪，先入队会让第一轮抢跑并把它拖到超时（DEC-0023）。
        enqueue(current.sessionFile, `@${current.briefFile}`);
        break;
      } catch (error) {
        if (!(error instanceof HerdrHostError && error.code === "name_taken")) {
          throw error;
        }
        await Promise.all([
          rm(current.briefFile, { force: true }),
          rm(current.identityFile, { force: true }),
          removeInbox(current.sessionFile),
        ]);
        if (retry >= NAME_ATTEMPTS) {
          throw new ToolError(
            "name_exhausted",
            `no free name for profile "${profileName}" after ${NAME_ATTEMPTS} attempts`,
          );
        }
        run.name = state.nextName(profileName);
        await state.host.renameTab({ tabId: run.pane.tabId, label: run.name });
        current = files(run.name);
        run.sessionFile = current.sessionFile;
      }
    }

    wake(state);

    return {
      state: "running",
      name: run.name,
      paneId: run.pane.paneId,
      sessionFile: run.sessionFile,
    };
  } catch (error) {
    const pane = run.pane;
    state.release(run);
    if (state.stopped && pane) {
      // 清理失败不改变结论：会话已在关闭，run 已被取消。
      await state.host.closeTabIfOnlyPane(pane).catch(() => "missing");
    }
    if (error instanceof ToolError) {
      throw error;
    }
    throw spawnFailed(error, pane?.paneId);
  }
}
