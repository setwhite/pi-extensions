// 每个 e2e 文件自建一套隔离环境：临时目录、隔离 agent 目录、named herdr session、真实 run 服务。
import type { ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll } from "vitest";
import { type AgentStatus, createHerdrClient, type HerdrClient, socketEndpoint } from "../../src/herdr/index.ts";
import { createTransport, type Transport } from "../../src/herdr/socket.ts";
import { createRunService, type Envelope, type RunService } from "../../src/run/index.ts";
import { installExtension, prepareDirs } from "./env.ts";
import { spawnSessionServer, stopSessionServer, waitForSessionServer } from "./herdr-server.ts";
import { HERDR_BIN } from "./prereq.ts";
import { cleanEnv, sleep } from "./process.ts";

export interface E2e {
  root: string;
  agentDir: string;
  project: string;
  runsDir: string;
  socket: string;
  client: HerdrClient;
  service: RunService;
  /** run 服务实际发出的 client 调用，按顺序记录。 */
  calls: string[];
  batches: Envelope[][];
  problems: string[];
  /** 原生 RPC：单测覆盖不到的命令（如 pane.process_info）在这里直接调。 */
  call(method: string, params?: Record<string, unknown>): Promise<unknown>;
  paneStatus(paneId: string): Promise<AgentStatus | undefined>;
  envelopes(): Envelope[];
  teardown(): Promise<void>;
}

export async function startE2e(): Promise<E2e> {
  const root = mkdtempSync(join(tmpdir(), "pi-herdr-e2e-"));
  const { agentDir, project, runsDir } = prepareDirs(root);
  const env = cleanEnv({ PI_CODING_AGENT_DIR: agentDir });
  await installExtension(env, root);

  const server = {
    bin: HERDR_BIN as string,
    sessionName: `e2e-${process.pid}-${Date.now().toString(36)}`,
    env,
    cwd: root,
  };
  const spawned: ChildProcess = spawnSessionServer(server);
  let transport: Transport | undefined;
  let client: HerdrClient | undefined;
  let service: RunService | undefined;
  try {
    const socket = await waitForSessionServer(server);
    const endpoint = socketEndpoint(socket);
    transport = createTransport(endpoint);
    client = createHerdrClient(endpoint);
    await transport.request("workspace.create", { cwd: project, label: "e2e", focus: true });
    const batches: Envelope[][] = [];
    const problems: string[] = [];
    const calls: string[] = [];
    // 记录 run 服务的调用顺序：真机上要验证它先轮询 agent.get 再 prompt。
    const recorded = Object.fromEntries(
      Object.entries(client).map(([name, method]) => [
        name,
        (...args: unknown[]) => {
          calls.push(name);
          return (method as (...inner: unknown[]) => unknown)(...args);
        },
      ]),
    ) as unknown as HerdrClient;
    service = createRunService({
      client: recorded,
      runsDir,
      maxConcurrent: 4,
      summaryMaxChars: 2000,
      aggregateWindowMs: 0,
      interruptGraceMs: 5000,
      onProblem: (message) => problems.push(message),
    });
    service.onBatch((batch) => {
      batches.push(batch);
    });
    const active = { client, service };
    return {
      root,
      agentDir,
      project,
      runsDir,
      socket,
      client: active.client,
      service: active.service,
      calls,
      batches,
      problems,
      call: (method, params) => (transport as Transport).request(method, params, { timeoutMs: 20_000 }),
      async paneStatus(paneId) {
        const panes = await active.client.listPanes();
        return panes.find((pane) => pane.paneId === paneId)?.agentStatus;
      },
      envelopes() {
        return batches.flat();
      },
      async teardown() {
        try {
          await active.service.closeChildren();
        } catch {
          // 清理失败不阻止停服务器。
        }
        await sleep(500);
        active.client.close();
        transport?.close();
        await stopSessionServer(server);
        spawned.kill();
        if (process.env.PI_E2E_KEEP === "1") {
          return;
        }
        // Windows 上子进程句柄释放有延迟。
        for (let attempt = 0; attempt < 5; attempt++) {
          try {
            rmSync(root, { recursive: true, force: true });
            return;
          } catch {
            await sleep(500);
          }
        }
      },
    };
  } catch (error) {
    client?.close();
    transport?.close();
    await stopSessionServer(server);
    spawned.kill();
    rmSync(root, { recursive: true, force: true });
    throw error;
  }
}

/** 文件被跳过时连 beforeAll 都不跑。 */
export function useE2e(): () => E2e {
  let current: E2e | undefined;
  beforeAll(async () => {
    current = await startE2e();
  }, 240_000);
  afterAll(async () => {
    await current?.teardown();
  }, 120_000);
  return () => {
    if (current === undefined) {
      throw new Error("e2e harness is not ready");
    }
    return current;
  };
}
