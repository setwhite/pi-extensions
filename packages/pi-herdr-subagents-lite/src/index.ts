import type { ExtensionFactory } from "@earendil-works/pi-coding-agent";
import { agentDir, loadConfig, runsDir, sessionsDir } from "./config/index.ts";
import { createExtension } from "./extension/index.ts";
import { createHerdrClient, socketEndpoint } from "./herdr/index.ts";

function socketPath(): string {
  const value = process.env.HERDR_SOCKET_PATH;
  if (value === undefined || value === "") {
    throw new Error("HERDR_SOCKET_PATH is not set; run pi inside a herdr pane");
  }
  return value;
}

const extension: ExtensionFactory = createExtension({
  loadConfig: () => loadConfig(agentDir()),
  createClient: () => createHerdrClient(socketEndpoint(socketPath())),
  runsDir: () => runsDir(agentDir()),
  sessionsDir: () => sessionsDir(agentDir()),
  depth: Number.parseInt(process.env.PI_SUBAGENT_DEPTH ?? "0", 10) || 0,
  runDir: process.env.PI_SUBAGENT_RUN_DIR,
});

export default extension;
