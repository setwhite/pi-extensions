import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach } from "vitest";
import { loadProfiles, type Profile, type ProfileCatalog } from "../../src/profile/index.ts";

let agentDir = "";
let projectDir = "";

export function useProfileDirs(): void {
  beforeEach(() => {
    agentDir = mkdtempSync(join(tmpdir(), "pi-herdr-profiles-"));
    projectDir = mkdtempSync(join(tmpdir(), "pi-herdr-project-"));
    process.env.PI_CODING_AGENT_DIR = agentDir;
  });

  afterEach(() => {
    delete process.env.PI_CODING_AGENT_DIR;
    rmSync(agentDir, { recursive: true, force: true });
    rmSync(projectDir, { recursive: true, force: true });
  });
}

export function agentRoot(): string {
  return agentDir;
}

export function profilesDir(): string {
  return join(agentDir, "pi-herdr-subagents-lite", "profiles");
}

export function catalog(options: { trusted?: boolean } = {}): ProfileCatalog {
  return loadProfiles({ cwd: projectDir, trusted: options.trusted ?? false });
}

export function writeProjectProfile(fileName: string, content: string): string {
  const file = join(projectDir, ".pi", "pi-herdr-subagents-lite", "profiles", fileName);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
  return file;
}

export function writeProfile(fileName: string, content: string): string {
  const file = join(profilesDir(), fileName);
  mkdirSync(profilesDir(), { recursive: true });
  writeFileSync(file, content);
  return file;
}

export function onlyProfile(): Profile {
  const { profiles } = catalog();
  const profile = profiles[0];
  if (profiles.length !== 1 || !profile) {
    throw new Error(`expected one profile, got ${profiles.length}`);
  }
  return profile;
}

export function profileFrom(frontmatter: string, body = "Body.\n"): Profile {
  const name = /^name:/m.test(frontmatter) ? "" : "name: explore\n";
  writeProfile("explore.md", `---\n${name}${frontmatter}\n---\n\n${body}`);
  return onlyProfile();
}
