import { samePath } from "./paths.ts";
import { AUTO_EXIT_ENV, parentCwd } from "./spawn-args.ts";
import type { RunPane, RunRecord, RunState } from "./state.ts";

export async function createPane(state: RunState, run: RunRecord, cwd: string, label: string): Promise<RunPane> {
  const env = { [AUTO_EXIT_ENV]: run.autoExit ? "1" : "0" };
  const inParent = samePath(cwd, parentCwd());
  const tab = inParent
    ? await state.host.createTab({ cwd, label: run.name, env })
    : await state.host.createWorkspace({ cwd, label: run.name, env });
  if (!inParent) {
    await state.host.renameTab({ tabId: tab.tabId, label: run.name });
  }
  await state.host.renamePane({ paneId: tab.paneId, label });
  return { tabId: tab.tabId, paneId: tab.paneId };
}
