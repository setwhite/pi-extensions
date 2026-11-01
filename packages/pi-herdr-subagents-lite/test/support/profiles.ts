import { mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { agentDir, projectDir } from "./env.ts";

function withProfileName(fileName: string, content: string): string {
  const name = basename(fileName, ".md");
  if (!content.startsWith("---\n")) {
    return `---\nname: ${name}\n---\n\n${content}`;
  }
  const lines = content.split("\n");
  if (lines.some((line) => line.startsWith("name:"))) {
    return content;
  }
  return [lines[0], `name: ${name}`, ...lines.slice(1)].join("\n");
}

export function writeProfile(fileName: string, content: string) {
  const file = join(agentDir, "pi-herdr-subagents-lite", "profiles", fileName);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, withProfileName(fileName, content));
}

export function writeSkill(dir: string, name: string) {
  const file = join(dir, name, "SKILL.md");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `---\ndescription: ${name} skill\n---\n\nBody.\n`);
}

export function sessionsRoot(): string {
  return join(agentDir, "pi-herdr-subagents-lite", "sessions");
}

export function writeProjectProfile(fileName: string, content: string) {
  const file = join(projectDir, ".pi", "pi-herdr-subagents-lite", "profiles", fileName);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, withProfileName(fileName, content));
}
