import { execFile } from "node:child_process";

export function sleep(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms));
}

export async function waitFor<T>(
  fn: () => T | Promise<T | null | undefined | false>,
  label: string,
  timeoutMs = 90_000,
): Promise<Exclude<T, null | undefined | false>> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await fn();
    if (value) {
      return value as Exclude<T, null | undefined | false>;
    }
    if (Date.now() >= deadline) {
      throw new Error(`timeout after ${timeoutMs}ms: ${label}`);
    }
    await sleep(200);
  }
}

export function run(
  bin: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; timeout?: number } = {},
): Promise<string> {
  return new Promise((done, fail) => {
    execFile(
      bin,
      args,
      {
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
        timeout: options.timeout ?? 60_000,
        cwd: options.cwd,
        env: options.env,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (error) {
          fail(new Error(`${bin} ${args.join(" ")} failed: ${stderr.trim() || error.message}`));
          return;
        }
        done(stdout);
      },
    );
  });
}

export function cleanEnv(extra: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith("HERDR_")) {
      env[key] = value;
    }
  }
  return { ...env, ...extra };
}

export function killProcess(pid: number): void {
  if (process.platform === "win32") {
    execFile("taskkill", ["/F", "/PID", String(pid)], { windowsHide: true }, () => {});
    return;
  }
  process.kill(pid, "SIGKILL");
}
