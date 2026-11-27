import { afterEach, describe, expect, it } from "vitest";
import { createTransport, HerdrError, type Transport } from "../../src/herdr/socket.ts";
import { type FakeHerdr, startFakeHerdr } from "../support/socket-server.ts";

const cleanups: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  for (const cleanup of cleanups.reverse()) {
    await cleanup();
  }
  cleanups.length = 0;
});

function track(server: FakeHerdr): void {
  cleanups.push(() => server.close());
}

function useTransport(endpoint: string): Transport {
  const transport = createTransport(endpoint);
  cleanups.push(() => transport.close());
  return transport;
}

describe("transport", () => {
  it("returns the result frame for a request", async () => {
    const server = await startFakeHerdr(() => ({ result: { type: "pong" } }));
    track(server);
    const transport = useTransport(server.endpoint);

    await expect(transport.request("ping", {})).resolves.toEqual({ type: "pong" });
    expect(server.requests).toHaveLength(1);
    expect(server.requests[0]?.method).toBe("ping");
  });

  it("rejects with the herdr error code", async () => {
    const server = await startFakeHerdr(() => ({ error: { code: "agent_blocked", message: "blocked" } }));
    track(server);
    const transport = useTransport(server.endpoint);

    await expect(transport.request("agent.prompt", {})).rejects.toMatchObject({
      name: "HerdrError",
      code: "agent_blocked",
      message: "blocked",
    });
  });

  it("gives up on a reply that never arrives", async () => {
    const server = await startFakeHerdr(() => undefined);
    track(server);
    const transport = useTransport(server.endpoint);

    await expect(transport.request("agent.wait", {}, { timeoutMs: 30 })).rejects.toMatchObject({
      code: "herdr_timeout",
    });
  });

  it("fails the pending request when the connection drops and reconnects on the next call", async () => {
    let reply = false;
    const server = await startFakeHerdr(() => (reply ? { result: { type: "pong" } } : undefined));
    track(server);
    const transport = useTransport(server.endpoint);

    const pending = transport.request("ping", {});
    await new Promise((resolve) => setTimeout(resolve, 50));
    server.dropConnections();
    await expect(pending).rejects.toBeInstanceOf(HerdrError);
    await expect(pending).rejects.toMatchObject({ code: "herdr_disconnected" });

    reply = true;
    await expect(transport.request("ping", {})).resolves.toEqual({ type: "pong" });
  });
});
