import net, { type Server, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface WireRequest {
  id: string;
  method: string;
  params: Record<string, unknown>;
}

export type HandlerResult =
  | { result: Record<string, unknown> }
  | { error: { code: string; message: string } }
  | undefined;

export interface FakeHerdr {
  endpoint: string;
  requests: WireRequest[];
  dropConnections(): void;
  close(): Promise<void>;
}

const BACKSLASH = String.fromCharCode(92);
const PIPE_DIR = BACKSLASH + BACKSLASH + "." + BACKSLASH + "pipe" + BACKSLASH;

let counter = 0;

function endpointFor(): string {
  counter += 1;
  const name = `pi-herdr-test-${process.pid}-${Date.now()}-${counter}`;
  return process.platform === "win32" ? PIPE_DIR + name : join(tmpdir(), `${name}.sock`);
}

export async function startFakeHerdr(handler: (request: WireRequest) => HandlerResult): Promise<FakeHerdr> {
  const endpoint = endpointFor();
  const requests: WireRequest[] = [];
  const sockets = new Set<Socket>();

  const server: Server = net.createServer((socket) => {
    sockets.add(socket);
    socket.setEncoding("utf8");
    let buffer = "";
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => sockets.delete(socket));
    socket.on("data", (chunk: string) => {
      buffer += chunk;
      let index = buffer.indexOf("\n");
      while (index >= 0) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 1);
        index = buffer.indexOf("\n");
        if (line.trim() === "") {
          continue;
        }
        const request = JSON.parse(line) as WireRequest;
        requests.push(request);
        const reply = handler(request);
        if (reply === undefined) {
          continue;
        }
        socket.write(`${JSON.stringify({ id: request.id, ...reply })}\n`);
      }
    });
  });

  await new Promise<void>((resolve) => server.listen(endpoint, resolve));

  return {
    endpoint,
    requests,
    dropConnections() {
      for (const socket of sockets) {
        socket.destroy();
      }
      sockets.clear();
    },
    async close() {
      for (const socket of sockets) {
        socket.destroy();
      }
      sockets.clear();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
