// 隔离的 pi agent 目录：只从真实目录借 auth.json 与模型选择。
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { REAL_AGENT_DIR } from "./prereq.ts";

const README = "# E2E Project\n";

export function prepareAgentDir(root: string, agentDir: string, project: string): void {
  mkdirSync(join(agentDir, "sessions"), { recursive: true });
  mkdirSync(join(agentDir, "pi-herdr-subagents-lite", "profiles"), { recursive: true });
  mkdirSync(project, { recursive: true });
  writeFileSync(join(project, "README.md"), README);
  copyFileSync(join(REAL_AGENT_DIR, "auth.json"), join(agentDir, "auth.json"));
  writeFileSync(join(agentDir, "trust.json"), JSON.stringify({ [root]: true }));
}

export function writeSettings(agentDir: string): void {
  let transport: string | undefined;
  let provider: string | undefined;
  let model: string | undefined;
  try {
    const real = JSON.parse(readFileSync(join(REAL_AGENT_DIR, "settings.json"), "utf8")) as Record<string, unknown>;
    transport = typeof real.transport === "string" ? real.transport : undefined;
    provider = typeof real.defaultProvider === "string" ? real.defaultProvider : undefined;
    model = typeof real.defaultModel === "string" ? real.defaultModel : undefined;
    const override = process.env.PI_E2E_MODEL;
    if (override !== undefined) {
      const [nextProvider, nextModel] = override.split("/");
      provider = nextProvider ?? provider;
      model = nextModel ?? model;
    }
  } catch {
    // 没有全局 settings：隔离目录仍可用，模型走 pi 默认。
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
  writeFileSync(join(agentDir, "keybindings.json"), JSON.stringify({ "app.session.new": "f12" }), "utf8");
}

export function writeConfigFile(agentDir: string, config: Record<string, unknown>): void {
  writeFileSync(join(agentDir, "pi-herdr-subagents-lite", "config.json"), JSON.stringify(config), "utf8");
}

export function writeProfileFile(agentDir: string, name: string, frontmatter: string, body: string): void {
  const file = join(agentDir, "pi-herdr-subagents-lite", "profiles", `${name}.md`);
  const named = /^name:/m.test(frontmatter) ? frontmatter : `name: ${name}\n${frontmatter}`;
  writeFileSync(file, `---\n${named}\n---\n\n${body}\n`, "utf8");
}
