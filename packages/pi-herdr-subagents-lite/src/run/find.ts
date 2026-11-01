import type { AgentEntry } from "../herdr/index.ts";
import { samePath } from "./paths.ts";
import type { RunRecord } from "./state.ts";

export function findAgent(agents: AgentEntry[], run: RunRecord): AgentEntry | undefined {
  const bySession = agents.find((entry) => entry.sessionFile !== null && samePath(entry.sessionFile, run.sessionFile));
  if (bySession) {
    return bySession;
  }
  const paneId = run.pane?.paneId;
  const byPane = paneId === undefined ? undefined : agents.find((entry) => entry.paneId === paneId);
  return byPane ?? agents.find((entry) => entry.name === run.name);
}
