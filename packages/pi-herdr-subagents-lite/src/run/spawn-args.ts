import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { Profile } from "../profile/index.ts";

export const AUTO_EXIT_ENV = "PI_SUBAGENT_AUTO_EXIT";

export function parentCwd(): string {
  return process.cwd();
}

export function resolveCwd(raw: string | undefined): string {
  if (raw === undefined) {
    return parentCwd();
  }
  const expanded = raw === "~" || raw.startsWith("~/") || raw.startsWith("~\\") ? join(homedir(), raw.slice(1)) : raw;
  return resolve(parentCwd(), expanded);
}

function toolSelection(profile: Profile, toolName: string): string[] {
  if (profile.tools === undefined) {
    return ["--exclude-tools", toolName];
  }
  if (profile.tools === "") {
    return ["--no-tools"];
  }
  const entries = profile.tools.split(",").map((entry) => entry.trim());
  const modifierList = entries.every((entry) => entry.startsWith("+") || entry.startsWith("-"));
  return modifierList && !entries.includes(`+${toolName}`)
    ? ["--tools", profile.tools, "--exclude-tools", toolName]
    : ["--tools", profile.tools];
}

export function agentArgs(
  profile: Profile,
  identityFile: string,
  toolName: string,
  skillPaths: string[] | undefined,
): string[] {
  const args: string[] = [];
  if (profile.model !== undefined) {
    args.push("--model", profile.model);
  }
  if (profile.thinking !== undefined) {
    args.push("--thinking", profile.thinking);
  }
  args.push(...toolSelection(profile, toolName));
  if (skillPaths !== undefined) {
    args.push("--no-skills");
    for (const file of skillPaths) {
      args.push("--skill", file);
    }
  }
  if (profile.systemPrompt === "append") {
    args.push("--append-system-prompt", identityFile);
  } else if (profile.systemPrompt === "replace") {
    args.push("--system-prompt", identityFile);
  }
  return args;
}

export function briefText(profile: Profile, task: string): string {
  const lead = profile.systemPrompt === "task" && profile.body !== "" ? `${profile.body}\n\n` : "";
  return `${lead}# Task\n${task}\n`;
}
