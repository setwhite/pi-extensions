import { homedir } from "node:os";
import { join } from "node:path";

export function agentDir(): string {
  return process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
}

export function dataDir(agentDirectory: string): string {
  return join(agentDirectory, "pi-herdr-subagents-lite");
}

export function runsDir(agentDirectory: string): string {
  return join(dataDir(agentDirectory), "runs");
}

export function configFile(agentDirectory: string): string {
  return join(dataDir(agentDirectory), "config.json");
}
