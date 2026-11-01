import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, vi } from "vitest";
import { setDirs, writeConfig } from "./env.ts";
import { writeProfile } from "./profiles.ts";

const tempDirs = new Set<string>();

beforeEach(() => {
  delete process.env.HERDR_ENV;
  delete process.env.PI_SUBAGENT_AUTO_EXIT;
  const agentDir = mkdtempSync(join(tmpdir(), "pi-herdr-agent-"));
  const projectDir = mkdtempSync(join(tmpdir(), "pi-herdr-project-"));
  setDirs(agentDir, projectDir);
  process.env.PI_CODING_AGENT_DIR = agentDir;
  writeProfile("worker.md", "Worker body.\n");
  writeConfig({});
  tempDirs.add(agentDir);
  tempDirs.add(projectDir);
});

afterEach(async () => {
  vi.useRealTimers();
  await Promise.all([...tempDirs].map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs.clear();
  delete process.env.HERDR_ENV;
  delete process.env.PI_CODING_AGENT_DIR;
  delete process.env.PI_SUBAGENT_AUTO_EXIT;
});
