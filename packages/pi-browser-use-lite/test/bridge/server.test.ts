import { afterEach, expect, it, vi } from "vitest";
import type { Bridge } from "../../src/bridge/index.ts";
import { DEFAULT_HOLD_MS } from "../../src/protocol/index.ts";
import { startBridge as openBridge } from "./start.ts";

const bridges: Bridge[] = [];

async function startBridge(holdMs?: number): Promise<Bridge> {
	const bridge = await openBridge({ holdMs });
	bridges.push(bridge);
	return bridge;
}

interface NextBody {
	type: "command" | "none";
	command?: { id: string; action: string; params?: Record<string, unknown> };
}

interface StatusBody {
	mode: string;
	connected: boolean;
	url: string;
	queuedCommands: number;
	pendingCommands: number;
}

function next(bridge: Bridge, signal?: AbortSignal): Promise<NextBody> {
	return fetch(`${bridge.url}/next`, { signal }).then(
		(response) => response.json() as Promise<NextBody>,
	);
}

function status(bridge: Bridge): Promise<StatusBody> {
	return fetch(`${bridge.url}/status`).then(
		(response) => response.json() as Promise<StatusBody>,
	);
}

function postResult(bridge: Bridge, body: unknown): Promise<Response> {
	return fetch(`${bridge.url}/result`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
}

afterEach(async () => {
	vi.restoreAllMocks();
	for (const bridge of bridges.splice(0)) await bridge.stop();
});

/** 睡眠。用真实定时器，别被下面那组 spy 认成桥的等待定时器。 */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

it("AC2: 无命令时，挂起时长用满后返回 type none", async () => {
	const bridge = await startBridge(50);
	const startedAt = Date.now();
	const body = await next(bridge);

	expect(body).toStrictEqual({ type: "none" });
	expect(Date.now() - startedAt).toBeGreaterThanOrEqual(45);
});

it("AC3: 先有命令时 /next 立刻返回该命令", async () => {
	const bridge = await startBridge(5_000);
	bridge.send("tab.list").catch(() => {});

	const startedAt = Date.now();
	const body = await next(bridge);

	expect(body.type).toBe("command");
	expect(body.command?.action).toBe("tab.list");
	expect(typeof body.command?.id).toBe("string");
	expect(Date.now() - startedAt).toBeLessThan(1_000);
});

it("AC4: /result 未知 id 回 404，已知 id 让命令的 Promise 以结果 resolve", async () => {
	const bridge = await startBridge(5_000);
	const unknown = await postResult(bridge, {
		id: "no-such-command",
		ok: true,
		result: 1,
	});
	expect(unknown.status).toBe(404);

	const pending = bridge.send("page.evaluate", { js: "1+1" });
	const { command } = await next(bridge);
	const known = await postResult(bridge, {
		id: command?.id,
		ok: true,
		result: 2,
	});

	expect(known.status).toBe(200);
	await expect(pending).resolves.toBe(2);
});

it("AC5: /status 报 mode 为 server", async () => {
	const bridge = await startBridge(10);
	expect((await status(bridge)).mode).toBe("server");
});

it("AC6: 两条命令按到达顺序各投递一条，不合并", async () => {
	const bridge = await startBridge(5_000);
	bridge.send("tab.list").catch(() => {});
	bridge.send("page.snapshot", { mode: "refs" }).catch(() => {});

	const first = await next(bridge);
	const second = await next(bridge);

	expect(first.command?.action).toBe("tab.list");
	expect(second.command?.action).toBe("page.snapshot");
	expect(first.command?.id).not.toBe(second.command?.id);
});

it("AC7: 从未轮询时 connected 为 false，轮询过一次后为 true", async () => {
	const bridge = await startBridge(10);
	expect((await status(bridge)).connected).toBe(false);

	await next(bridge);
	expect((await status(bridge)).connected).toBe(true);
});

it("停服后 status 报 stopped，send 立刻被拒", async () => {
	const bridge = await startBridge(10);
	await bridge.stop();

	expect(bridge.status().mode).toBe("stopped");
	await expect(bridge.send("tab.list")).rejects.toThrow("not running");
});

it("长轮询断线后不留下等待用的定时器", async () => {
	const bridge = await startBridge(60_000);
	const set = vi.spyOn(globalThis, "setTimeout");
	const clear = vi.spyOn(globalThis, "clearTimeout");
	const controller = new AbortController();
	const request = next(bridge, controller.signal).catch(() => undefined);

	await sleep(100);
	controller.abort();
	await request;
	await sleep(100);

	const armed = set.mock.calls
		.map((call, index) => ({ delay: call[1], result: set.mock.results[index] }))
		.filter((entry) => entry.delay === 60_000)
		.map((entry) => (entry.result as { value?: unknown }).value);
	expect(armed).toHaveLength(1);
	expect(clear.mock.calls.map((call) => call[0])).toContain(armed[0]);
});

it("AC8: 不注入挂起时长时默认 25 秒", async () => {
	const bridge = await startBridge();
	expect(DEFAULT_HOLD_MS).toBe(25_000);
	expect(bridge.holdMs).toBe(25_000);

	const controller = new AbortController();
	const request = next(bridge, controller.signal);
	await new Promise((resolve) => setTimeout(resolve, 300));
	controller.abort();
	await expect(request).rejects.toThrow();
});
