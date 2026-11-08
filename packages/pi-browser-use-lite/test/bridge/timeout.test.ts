import { afterEach, expect, it } from "vitest";
import { Bridge } from "../../src/bridge/index.ts";
import { HOST_VERSION } from "../../src/config/index.ts";
import {
	type BridgeError,
	DEFAULT_COMMAND_TIMEOUT_MS,
} from "../../src/protocol/index.ts";

const bridges: Bridge[] = [];

async function startBridge(holdMs?: number): Promise<Bridge> {
	const bridge = new Bridge({ port: 0, holdMs, hostVersion: HOST_VERSION });
	bridges.push(bridge);
	await bridge.start();
	return bridge;
}

interface NextBody {
	type: "command" | "none";
	command?: { id: string; action: string; params?: Record<string, unknown> };
}

function next(bridge: Bridge): Promise<NextBody> {
	return fetch(`${bridge.url}/next`).then(
		(response) => response.json() as Promise<NextBody>,
	);
}

function postResult(bridge: Bridge, body: unknown): Promise<Response> {
	return fetch(`${bridge.url}/result`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
}

/** 断言这条命令被拒，并把拒绝原因取回来。 */
function catchError(promise: Promise<unknown>): Promise<BridgeError> {
	return promise.then(
		() => {
			throw new Error("expected the command to reject");
		},
		(error: unknown) => error as BridgeError,
	);
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

afterEach(async () => {
	for (const bridge of bridges.splice(0)) await bridge.stop();
});

it("AC2: 扩展从未轮询时，超时消息含 not polling", async () => {
	const bridge = await startBridge(10);
	const error = await catchError(
		bridge.send("tab.list", undefined, { timeoutMs: 50 }),
	);

	expect(error.message).toContain("not polling");
});

it("AC3: 扩展轮询过但没取走命令时，超时消息含 did not pick up", async () => {
	const bridge = await startBridge(10);
	expect((await next(bridge)).type).toBe("none");

	const error = await catchError(
		bridge.send("tab.list", undefined, { timeoutMs: 50 }),
	);

	expect(error.message).toContain("did not pick up");
});

it("AC4: 命令已投递但无结果时，超时消息含 never returned a result", async () => {
	const bridge = await startBridge(1_000);
	const poll = next(bridge);
	const rejection = catchError(
		bridge.send("tab.list", undefined, { timeoutMs: 80 }),
	);

	expect((await poll).command?.action).toBe("tab.list");
	expect((await rejection).message).toContain("never returned a result");
});

it("AC5: AbortSignal 触发时以 aborted 拒绝，且命令不再出现在 /next", async () => {
	const bridge = await startBridge(100);
	const controller = new AbortController();
	const pending = bridge.send("tab.list", undefined, {
		signal: controller.signal,
	});

	controller.abort();

	await expect(pending).rejects.toThrow("aborted");
	expect(await next(bridge)).toStrictEqual({ type: "none" });
});

it("AC6: timeout 与 bridge_unreachable 的 details.error 带 class 与非空 hint", async () => {
	const bridge = await startBridge(100);
	const timeout = await catchError(
		bridge.send("tab.list", undefined, { timeoutMs: 30 }),
	);

	expect(timeout.details.error.class).toBe("timeout");
	expect(timeout.details.error.hint).not.toBe("");

	await bridge.stop();
	const unreachable = await catchError(bridge.send("tab.list"));

	expect(unreachable.details.error.class).toBe("bridge_unreachable");
	expect(unreachable.details.error.hint).not.toBe("");
});

it("AC6: aborted 的 class 为 aborted，hint 指出可以重试", async () => {
	const bridge = await startBridge(100);
	const controller = new AbortController();
	const pending = bridge.send("tab.list", undefined, {
		signal: controller.signal,
	});

	controller.abort();
	const error = await catchError(pending);

	expect(error.details.error.class).toBe("aborted");
	expect(error.details.error.hint).toBe("retry if you still need the result");
});

it("AC6: 扩展回传 ok 为 false 时以 page_error 拒绝并保留原始消息", async () => {
	const bridge = await startBridge(1_000);
	const rejection = catchError(bridge.send("page.evaluate", { js: "boom" }));
	const { command } = await next(bridge);

	await postResult(bridge, { id: command?.id, ok: false, error: "boom" });
	const error = await rejection;

	expect(error.details.error.class).toBe("page_error");
	expect(error.message).toContain("boom");
});

it("超时从入队时刻算，不从扩展取走时刻算", async () => {
	const bridge = await startBridge(1_000);
	const startedAt = Date.now();
	const rejection = catchError(
		bridge.send("tab.list", undefined, { timeoutMs: 300 }),
	);

	await sleep(150);
	expect((await next(bridge)).type).toBe("command");
	const error = await rejection;

	expect(error.message).toContain("never returned a result");
	expect(Date.now() - startedAt).toBeLessThan(400);
});

it("不传 timeoutMs 时按 30 秒超时，不跟着短超时走", async () => {
	expect(DEFAULT_COMMAND_TIMEOUT_MS).toBe(30_000);
	const bridge = await startBridge(10);

	const short = await catchError(
		bridge.send("tab.list", undefined, { timeoutMs: 50 }),
	);
	expect(short.details.error.class).toBe("timeout");

	let settled = false;
	const defaulted = bridge.send("page.snapshot");
	defaulted.then(
		() => (settled = true),
		() => (settled = true),
	);
	await sleep(300);

	expect(settled).toBe(false);
});
