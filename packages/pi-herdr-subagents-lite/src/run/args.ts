import { homedir } from "node:os";
import { join, resolve } from "node:path";

export interface ChildEnvInput {
  id: string;
  runDir: string;
}

/** 子代理身份只走进程环境：主子判定不看 TTY、不看进程名。 */
export function childEnv(input: ChildEnvInput): Record<string, string> {
  return {
    PI_SUBAGENT_DEPTH: "1",
    PI_SUBAGENT_ID: input.id,
    PI_SUBAGENT_RUN_DIR: input.runDir,
  };
}

export interface ChildArgsInput {
  sessionFile: string;
  tools?: string[];
  skills?: string[];
  model?: string;
  thinking?: string;
}

/** 子代理的 pi 启动参数。ask 永远剔除，防止子 pane 里弹表单打断人类。 */
export function childArgs(input: ChildArgsInput): string[] {
  const args = ["--session", input.sessionFile];
  if (input.model !== undefined) {
    args.push("--model", input.model);
  }
  if (input.thinking !== undefined) {
    args.push("--thinking", input.thinking);
  }
  if (input.tools !== undefined) {
    args.push("--tools", input.tools.join(","));
  }
  args.push("--exclude-tools", "ask");
  for (const skill of input.skills ?? []) {
    args.push("--skill", skill);
  }
  return args;
}

export function resolveCwd(raw: string | undefined): string {
  if (raw === undefined) {
    return process.cwd();
  }
  const expanded = raw === "~" || raw.startsWith("~/") || raw.startsWith("~\\") ? join(homedir(), raw.slice(1)) : raw;
  return resolve(process.cwd(), expanded);
}

export function promptText(objective: string, context: string | undefined): string {
  const body = ["# Objective", objective.trim()];
  if (context !== undefined && context.trim() !== "") {
    body.push("", "# Context", context.trim());
  }
  return `${body.join("\n")}\n`;
}
