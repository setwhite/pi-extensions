import { execFile } from "node:child_process";

export class HerdrHostError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "HerdrHostError";
    this.code = code;
  }
}

interface HerdrErrorBody {
  code?: string;
  message?: string;
}

const HOST_ERROR_CODES: Record<string, string> = {
  agent_name_taken: "name_taken",
};

// 查询超时重查一次就行；变更超时留下「不知道生效没有」，所以要给足余量。
const TIMEOUT_MS = { query: 20_000, mutation: 120_000 } as const;

export type HerdrCall = { signal?: AbortSignal };
export type ExecOptions = HerdrCall & { kind: keyof typeof TIMEOUT_MS };

function hostError(code: string, message: string): HerdrHostError {
  return new HerdrHostError(HOST_ERROR_CODES[code] ?? code, message);
}

function parseHerdrError(text: string): HerdrErrorBody | null {
  if (!text.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(text) as { error?: HerdrErrorBody };
    return parsed.error?.code ? parsed.error : null;
  } catch {
    return null;
  }
}

function commandLine(args: string[]): string {
  return `herdr ${args.join(" ")}`;
}

// 每条命令都有上限：卡住的 CLI 不能吃掉整轮工具调用。
export function execCommand(
  bin: string,
  args: string[],
  options: { signal?: AbortSignal; timeoutMs?: number },
): Promise<string> {
  const timeoutMs = options.timeoutMs ?? TIMEOUT_MS.mutation;
  return new Promise((resolve, reject) => {
    execFile(
      bin,
      args,
      {
        encoding: "utf8",
        windowsHide: true,
        maxBuffer: 8 * 1024 * 1024,
        timeout: timeoutMs,
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      },
      (error, stdout, stderr) => {
        if (!error) {
          resolve(stdout);
          return;
        }
        const parsed = parseHerdrError(stderr) ?? parseHerdrError(stdout);
        if (parsed) {
          reject(hostError(parsed.code ?? "herdr_failed", parsed.message ?? parsed.code ?? "herdr failed"));
          return;
        }
        if (options.signal?.aborted === true) {
          reject(new HerdrHostError("aborted", `${commandLine(args)} was cancelled`));
          return;
        }
        const failure = error as NodeJS.ErrnoException & { killed?: boolean };
        const timedOut = failure.killed === true && failure.code !== "ERR_CHILD_PROCESS_STDIO_MAXBUFFER";
        reject(
          timedOut
            ? new HerdrHostError(
                "herdr_timeout",
                `${commandLine(args)} timed out; it may have taken effect. Check the tab before retrying.`,
              )
            : new HerdrHostError("herdr_failed", error.message),
        );
      },
    );
  });
}

export type ExecHerdr = <T>(args: string[], options: ExecOptions) => Promise<T>;

export interface HerdrExec {
  execJson: ExecHerdr;
}

export function createHerdrExec(bin: string): HerdrExec {
  return { execJson: (args, options) => execJson(bin, args, options) };
}

async function execJson<T>(bin: string, args: string[], options: ExecOptions): Promise<T> {
  const stdout = await execCommand(bin, args, { signal: options.signal, timeoutMs: TIMEOUT_MS[options.kind] });
  let parsed: { result?: T; error?: HerdrErrorBody };
  try {
    parsed = JSON.parse(stdout) as { result?: T; error?: HerdrErrorBody };
  } catch {
    throw new HerdrHostError("herdr_protocol", `${commandLine(args)}: invalid JSON`);
  }
  if (parsed.error?.code) {
    throw hostError(parsed.error.code, parsed.error.message ?? parsed.error.code);
  }
  if (parsed.result === undefined) {
    throw new HerdrHostError("herdr_protocol", `${commandLine(args)}: no result`);
  }
  return parsed.result;
}
