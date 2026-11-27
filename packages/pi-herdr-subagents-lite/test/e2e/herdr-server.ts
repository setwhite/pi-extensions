// named session 的 server 生命周期：spawn、等它上线拿到 socket、停掉并删 session。
import { type ChildProcess, spawn } from "node:child_process";
import { run, waitFor } from "./process.ts";

export interface SessionServer {
  bin: string;
  sessionName: string;
  env: NodeJS.ProcessEnv;
  cwd: string;
}

export function spawnSessionServer({ bin, sessionName, env, cwd }: SessionServer): ChildProcess {
  const server = spawn(bin, ["--session", sessionName, "server"], {
    detached: true,
    stdio: "ignore",
    env,
    windowsHide: true,
    cwd,
  });
  server.unref();
  // spawn 失败是异步事件；没人监听会变成 uncaught exception，把整个套件判失败。
  server.on("error", () => {});
  return server;
}

/** 返回这条 named session 的 socket 路径。 */
export async function waitForSessionServer({ bin, sessionName, env }: SessionServer): Promise<string> {
  const status = await waitFor(
    async () => {
      const text = await run(bin, ["--session", sessionName, "status", "server", "--json"], { env });
      const parsed = JSON.parse(text) as { running?: boolean; socket?: string };
      if (parsed.socket === undefined || !parsed.socket.includes(sessionName)) {
        throw new Error(`refusing to use socket ${parsed.socket}: not this session`);
      }
      return parsed.running === true ? parsed : null;
    },
    "herdr server to start",
    30_000,
  );
  if (status.socket === undefined) {
    throw new Error("herdr server did not report a socket");
  }
  return status.socket;
}

export async function stopSessionServer({ bin, sessionName, env }: SessionServer): Promise<void> {
  try {
    await run(bin, ["--session", sessionName, "server", "stop"], { env, timeout: 15_000 });
  } catch {
    // 服务器可能已退出。
  }
  try {
    await run(bin, ["session", "delete", sessionName], { env, timeout: 15_000 });
  } catch {
    // 同上。
  }
}
