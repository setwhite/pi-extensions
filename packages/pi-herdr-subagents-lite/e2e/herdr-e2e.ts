// 每次运行一套隔离环境：temp 目录、agent 目录、named herdr session。
import type { ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareAgentDir, writeConfigFile, writeProfileFile, writeSettings } from "./agent-dir.ts";
import { closeChildren } from "./children.ts";
import { spawnSessionServer, stopSessionServer, waitForSessionServer } from "./herdr-server.ts";
import { HerdrSession } from "./herdr-session.ts";
import { startParent } from "./parent.ts";
import { HERDR_BIN, PI_BIN, prereqs, REPO } from "./prereq.ts";
import { cleanEnv, run, sleep } from "./process.ts";

export class HerdrE2e extends HerdrSession {
  readonly root: string;
  readonly agentDir: string;
  readonly project: string;
  private server: ChildProcess | undefined;

  private constructor(root: string, sessionName: string) {
    const agentDir = join(root, "agent");
    super(sessionName, cleanEnv({ PI_CODING_AGENT_DIR: agentDir }), root);
    this.root = root;
    this.agentDir = agentDir;
    this.project = join(root, "project");
  }

  static async create(): Promise<HerdrE2e> {
    const state = prereqs();
    if (!state.ok) {
      throw new Error(`e2e prerequisites missing: ${state.reason}`);
    }
    const root = mkdtempSync(join(tmpdir(), "pi-herdr-e2e-"));
    const e2e = new HerdrE2e(root, `e2e-${process.pid}-${Date.now().toString(36)}`);
    try {
      await e2e.setup();
      return e2e;
    } catch (error) {
      await e2e.teardown();
      throw error;
    }
  }

  private async setup(): Promise<void> {
    prepareAgentDir(this.root, this.agentDir, this.project);
    writeSettings(this.agentDir);
    this.writeConfig({ maxConcurrent: 16, inboxPollMs: 100, pollIntervalMs: 200, idlePollIntervalMs: 200 });
    await run(PI_BIN as string, ["install", REPO, "--no-approve"], { env: this.env, cwd: this.root });
    const server = {
      bin: HERDR_BIN as string,
      sessionName: this.sessionName,
      env: this.env,
      cwd: this.root,
    };
    this.server = spawnSessionServer(server);
    await waitForSessionServer(server);
    await this.createWorkspace(this.project);
  }

  writeConfig(config: Record<string, unknown>): void {
    writeConfigFile(this.agentDir, config);
  }

  writeProfile(name: string, frontmatter: string, body: string): void {
    writeProfileFile(this.agentDir, name, frontmatter, body);
  }

  async startParent(name: string): Promise<{ sessionFile: string; paneId: string }> {
    return startParent(this, { agentDir: this.agentDir, project: this.project, name });
  }

  async closeChildren(): Promise<void> {
    await closeChildren(this);
  }

  async teardown(): Promise<void> {
    try {
      await this.closeChildren();
    } catch {
      // 清理失败不阻止停服务器。
    }
    await stopSessionServer({
      bin: HERDR_BIN as string,
      sessionName: this.sessionName,
      env: this.env,
      cwd: this.root,
    });
    this.server?.kill();
    if (process.env.PI_E2E_KEEP === "1") {
      return;
    }
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        rmSync(this.root, { recursive: true, force: true });
        return;
      } catch {
        await sleep(500);
      }
    }
  }
}
