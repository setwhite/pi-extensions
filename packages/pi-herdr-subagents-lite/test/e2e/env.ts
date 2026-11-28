// 隔离的 pi agent 目录与临时项目：只从真实目录借 auth.json 与模型选择。
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PI_BIN, REAL_AGENT_DIR, REPO } from "./prereq.ts";
import { run } from "./process.ts";

const README = "# E2E Project\n\nThis is a throwaway project for real-machine tests.\n";

export interface IsolatedEnv {
  agentDir: string;
  project: string;
  runsDir: string;
  sessionsDir: string;
}

export function prepareDirs(root: string): IsolatedEnv {
  const agentDir = join(root, "agent");
  const project = join(root, "project");
  const runsDir = join(agentDir, "pi-herdr-subagents-lite", "runs");
  const sessionsDir = join(agentDir, "pi-herdr-subagents-lite", "sessions");
  mkdirSync(join(agentDir, "sessions"), { recursive: true });
  mkdirSync(runsDir, { recursive: true });
  mkdirSync(sessionsDir, { recursive: true });
  mkdirSync(project, { recursive: true });
  writeFileSync(join(project, "README.md"), README);
  // 装上 herdr 的 pi 集成（hook authority）：不装时 herdr 靠屏幕检测推进状态，
  // agent.get 轮询缺失这类 bug 就测不出来。
  const extensions = join(agentDir, "extensions");
  mkdirSync(extensions, { recursive: true });
  copyFileSync(fixturePath("herdr-agent-state.ts"), join(extensions, "herdr-agent-state.ts"));
  copyFileSync(join(REAL_AGENT_DIR, "auth.json"), join(agentDir, "auth.json"));
  writeFileSync(join(agentDir, "trust.json"), JSON.stringify({ [root]: true, [project]: true }));
  writeSettings(agentDir);
  writeConfig(agentDir);
  return { agentDir, project, runsDir, sessionsDir };
}

function fixturePath(name: string): string {
  return fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
}

/** 子代理继承 defaultProjectTrust，才不会在自己的 pane 里卡信任提示。 */
function writeSettings(agentDir: string): void {
  let transport: string | undefined;
  let provider: string | undefined;
  let model: string | undefined;
  try {
    const real = JSON.parse(readFileSync(join(REAL_AGENT_DIR, "settings.json"), "utf8")) as Record<string, unknown>;
    transport = typeof real.transport === "string" ? real.transport : undefined;
    provider = typeof real.defaultProvider === "string" ? real.defaultProvider : undefined;
    model = typeof real.defaultModel === "string" ? real.defaultModel : undefined;
  } catch {
    // 没有全局 settings：模型走 pi 默认。
  }
  const override = process.env.PI_E2E_MODEL;
  if (override !== undefined && override !== "") {
    const [nextProvider, nextModel] = override.split("/");
    provider = nextProvider ?? provider;
    model = nextModel ?? model;
  }
  writeFileSync(
    join(agentDir, "settings.json"),
    JSON.stringify({
      transport,
      defaultProvider: provider,
      defaultModel: model,
      defaultThinkingLevel: "off",
      defaultProjectTrust: "always",
    }),
    "utf8",
  );
}

function writeConfig(agentDir: string): void {
  writeFileSync(
    join(agentDir, "pi-herdr-subagents-lite", "config.json"),
    JSON.stringify({ aggregateWindowMs: 0, interruptGraceMs: 5000, runRetentionMs: 0 }),
    "utf8",
  );
}

/** 隔离目录里装着本包，子代理才会注册 request_input 并在 turn_end 落盘。 */
export async function installExtension(env: NodeJS.ProcessEnv, cwd: string): Promise<void> {
  await run(PI_BIN as string, ["install", REPO, "--no-approve"], { env, cwd, timeout: 120_000 });
}
