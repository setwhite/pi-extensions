import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export let agentDir = "";
export let projectDir = "";

export function setDirs(agent: string, project: string) {
  agentDir = agent;
  projectDir = project;
}

export function configFile(): string {
  return join(agentDir, "pi-herdr-subagents-lite", "config.json");
}

export function writeConfig(value: unknown) {
  const merged =
    typeof value === "object" && value !== null && !Array.isArray(value) ? { aggregateWindowMs: 0, ...value } : value;
  mkdirSync(dirname(configFile()), { recursive: true });
  writeFileSync(configFile(), JSON.stringify(merged));
}
