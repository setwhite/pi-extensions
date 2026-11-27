import net, { type Socket } from "node:net";

export class HerdrError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "HerdrError";
    this.code = code;
  }
}

export interface RequestOptions {
  timeoutMs?: number;
}

/** 每条请求一条本地 Socket 连接：herdr 回完一帧就关连接（其官方 pi 集成也这么做）。 */
export interface Transport {
  request(method: string, params?: Record<string, unknown>, options?: RequestOptions): Promise<unknown>;
  close(): void;
}

interface Frame {
  id?: unknown;
  result?: unknown;
  error?: { code?: string; message?: string };
}

export function createTransport(endpoint: string): Transport {
  let counter = 0;
  let closed = false;
  const sockets = new Set<Socket>();

  function attempt(method: string, params: Record<string, unknown>, options: RequestOptions): Promise<unknown> {
    return new Promise<unknown>((resolve, reject) => {
      const id = `pi-${++counter}`;
      const socket = net.createConnection(endpoint);
      sockets.add(socket);
      socket.setEncoding("utf8");
      let buffer = "";
      let settled = false;

      const finish = (error: Error | undefined, value?: unknown): void => {
        if (settled) {
          return;
        }
        settled = true;
        if (timer !== undefined) {
          clearTimeout(timer);
        }
        sockets.delete(socket);
        socket.destroy();
        if (error === undefined) {
          resolve(value);
        } else {
          reject(error);
        }
      };

      const timer =
        options.timeoutMs === undefined
          ? undefined
          : setTimeout(() => {
              finish(new HerdrError("herdr_timeout", `${method} timed out after ${options.timeoutMs}ms`));
            }, options.timeoutMs);
      timer?.unref?.();

      const fail = (error: Error) => finish(new HerdrError("herdr_disconnected", error.message));

      socket.on("data", (chunk: string) => {
        buffer += chunk;
        let index = buffer.indexOf("\n");
        while (index >= 0) {
          const line = buffer.slice(0, index);
          buffer = buffer.slice(index + 1);
          if (line.trim() !== "") {
            let frame: Frame | undefined;
            try {
              frame = JSON.parse(line) as Frame;
            } catch {
              frame = undefined;
            }
            if (frame !== undefined && frame.id === id) {
              if (frame.error !== undefined) {
                finish(new HerdrError(frame.error.code ?? "herdr_failed", frame.error.message ?? "herdr failed"));
              } else {
                finish(undefined, frame.result);
              }
              return;
            }
          }
          index = buffer.indexOf("\n");
        }
      });
      socket.on("error", fail);
      socket.on("close", () => finish(new HerdrError("herdr_disconnected", "herdr socket closed")));
      socket.once("connect", () => {
        socket.write(`${JSON.stringify({ id, method, params })}\n`, (error) => {
          if (error !== null && error !== undefined) {
            fail(error);
          }
        });
      });
    });
  }

  return {
    async request(method, params = {}, options = {}) {
      if (closed) {
        throw new HerdrError("herdr_closed", "transport is closed");
      }
      return await attempt(method, params, options);
    },
    close() {
      closed = true;
      for (const socket of sockets) {
        socket.destroy();
      }
      sockets.clear();
    },
  };
}
