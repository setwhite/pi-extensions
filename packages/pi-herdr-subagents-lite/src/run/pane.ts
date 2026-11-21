import { samePath } from "./paths.ts";
import { parentCwd } from "./spawn-args.ts";
import type { RunPane, RunRecord, RunState } from "./state.ts";

export async function createPane(
  state: RunState,
  run: RunRecord,
  cwd: string,
  label: string,
  signal: AbortSignal | undefined,
): Promise<RunPane> {
  const call = signal === undefined ? undefined : { signal };
  const inParent = samePath(cwd, parentCwd());
  const tab = inParent
    ? await state.host.createTab({ cwd, label: run.name }, call)
    : await state.host.createWorkspace({ cwd, label: run.name }, call);
  if (!inParent) {
    await state.host.renameTab({ tabId: tab.tabId, label: run.name }, call);
  }
  await state.host.renamePane({ paneId: tab.paneId, label }, call);
  return { tabId: tab.tabId, paneId: tab.paneId };
}
