import { createServer, type Server } from "node:http";
import { afterEach, expect, it, vi } from "vitest";
import { Bridge } from "../../src/bridge/index.ts";
import { HOST_VERSION } from "../../src/config/index.ts";
import {
	BridgeError,
	EXTENSION_VERSION_HEADER,
	HOST_VERSION_HEADER,
} from "../../src/protocol/index.ts";
import { stubChrome } from "./input/chrome-stub.ts";

interface Transport {
	stop: () => void;
	done: Promise<void>;
}

interface TransportOptions {
	url?: string;
	pollIntervalMs?: number;
	requestTimeoutMs?: number;
	version: string;
	dispatch: (action: string, params?: Record<string, unknown>) => unknown;
}

/** 扩展侧的 JS 没有类型声明，用文件 URL 动态载入。 */
function extensionUrl(path: string): string {
	return new URL(`../../browser-extension/background/${path}`, import.meta.url)
		.href;
}

const {
	startTransport,
	VERSION_HEADER,
	HOST_VERSION_HEADER: EXTENSION_HOST_VERSION_HEADER,
} = (await import(extensionUrl("transport.js"))) as {
	startTransport: (options: TransportOptions) => Transport;
	VERSION_HEADER: string;
	HOST_VERSION_HEADER: string;
};
const { dispatch } = (await import(extensionUrl("dispatch.js"))) as {
	dispatch: (action: string, params?: Record<string, unknown>) => unknown;
};

interface Recorded {
	method: string;
	path: string;
	at: number;
	body?: unknown;
}

interface StubBridge {
	url: string;
	requests: Recorded[];
}

const servers: Server[] = [];
const transports: Transport[] = [];
const bridges: Bridge[] = [];

/** 起一个假桥：/next 按队列应答，/result 只记录；给了 hostVersion 就写进每个应答头。 */
async function startStubBridge(
	replies: unknown[],
	hostVersion?: string,
): Promise<StubBridge> {
	const requests: Recorded[] = [];
	const server = createServer((request, response) => {
		const chunks: Buffer[] = [];
		request.on("data", (chunk: Buffer) => chunks.push(chunk));
		request.on("end", () => {
			const text = Buffer.concat(chunks).toString("utf8");
			requests.push({
				method: request.method ?? "",
				path: request.url ?? "",
				at: Date.now(),
				body: text === "" ? undefined : JSON.parse(text),
			});
			response.writeHead(200, {
				"content-type": "application/json",
				...(hostVersion === undefined
					? {}
					: { [EXTENSION_HOST_VERSION_HEADER]: hostVersion }),
			});
			if (request.url === "/next")
				response.end(JSON.stringify(replies.shift() ?? { type: "none" }));
			else response.end(JSON.stringify({ ok: true }));
		});
	});
	servers.push(server);
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	const port =
		typeof address === "object" && address !== null ? address.port : 0;
	return { url: `http://127.0.0.1:${port}`, requests };
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(
	condition: () => boolean | Promise<boolean>,
	timeoutMs = 2_000,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!(await condition())) {
		if (Date.now() > deadline) throw new Error("condition not met in time");
		await sleep(5);
	}
}

interface NextBody {
	type: "command" | "none";
	command?: { id: string; action: string; params?: Record<string, unknown> };
}

function nextBody(url: string): Promise<NextBody> {
	return fetch(`${url}/next`).then(
		(response) => response.json() as Promise<NextBody>,
	);
}

function postResult(url: string, body: unknown): Promise<Response> {
	return fetch(`${url}/result`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
}

/** 桥报回的扩展版本。握手完成后才有值。 */
async function reportedVersion(url: string): Promise<string | undefined> {
	const response = await fetch(`${url}/status`);
	const body = (await response.json()) as { extensionVersion?: string };
	return body.extensionVersion;
}

/** 用真桥跑一段真传输，等握手完成。 */
async function startPaired(version: string): Promise<Bridge> {
	stubChrome({ version });
	const bridge = new Bridge({ port: 0, holdMs: 50, hostVersion: HOST_VERSION });
	bridges.push(bridge);
	await bridge.start();
	transports.push(
		startTransport({ url: bridge.url, pollIntervalMs: 20, version, dispatch }),
	);
	await waitFor(async () => (await reportedVersion(bridge.url)) === version);
	return bridge;
}

afterEach(async () => {
	for (const transport of transports.splice(0)) transport.stop();
	for (const bridge of bridges.splice(0)) await bridge.stop();
	for (const server of servers.splice(0))
		await new Promise<void>((resolve) => server.close(() => resolve()));
	delete (globalThis as { chrome?: unknown }).chrome;
	vi.restoreAllMocks();
});

it("AC2: /next 回 none 时，下一次请求在 100 毫秒后发生", async () => {
	const stub = await startStubBridge([]);
	const transport = startTransport({
		url: stub.url,
		pollIntervalMs: 100,
		version: HOST_VERSION,
		dispatch: () => undefined,
	});
	transports.push(transport);

	await waitFor(() => stub.requests.length >= 3);

	const nexts = stub.requests.filter((item) => item.path === "/next");
	const gap = (nexts[1]?.at ?? 0) - (nexts[0]?.at ?? 0);
	expect(gap).toBeGreaterThanOrEqual(95);
	// 上界只守「没有卡住」：回环请求本机实测抖动可到 1 秒，卡死另由超时用例覆盖。
	expect(gap).toBeLessThan(5_000);
});

it("AC3: /next 回命令时调用 dispatch，并用同一个 id 回传结果", async () => {
	const stub = await startStubBridge([
		{
			type: "command",
			command: { id: "c1", action: "tab.list", remainingMs: 1_000 },
		},
	]);
	const dispatch = vi.fn(() => [{ id: 1 }]);
	const transport = startTransport({
		url: stub.url,
		pollIntervalMs: 100,
		version: HOST_VERSION,
		dispatch,
	});
	transports.push(transport);

	await waitFor(() => stub.requests.some((item) => item.path === "/result"));

	expect(dispatch).toHaveBeenCalledWith("tab.list", undefined);
	const posted = stub.requests.find((item) => item.path === "/result");
	expect(posted?.body).toEqual({ id: "c1", ok: true, result: [{ id: 1 }] });
});

it("AC4: dispatch 抛错时回传 ok 为 false 与错误消息", async () => {
	const stub = await startStubBridge([
		{
			type: "command",
			command: { id: "c2", action: "page.evaluate", remainingMs: 1_000 },
		},
	]);
	const transport = startTransport({
		url: stub.url,
		pollIntervalMs: 100,
		version: HOST_VERSION,
		dispatch: () => {
			throw new Error("injected failure");
		},
	});
	transports.push(transport);

	await waitFor(() => stub.requests.some((item) => item.path === "/result"));

	const posted = stub.requests.find((item) => item.path === "/result");
	expect(posted?.body).toEqual({
		id: "c2",
		ok: false,
		error: { class: "page_error", message: "injected failure" },
	});
});

it("命令到期就不再等它：回 timeout，轮询接着问桥", async () => {
	const stub = await startStubBridge([
		{
			type: "command",
			command: { id: "c3", action: "page.navigate", remainingMs: 20 },
		},
	]);
	const transport = startTransport({
		url: stub.url,
		pollIntervalMs: 100,
		version: HOST_VERSION,
		// 永远不 settle：模拟卡住的 CDP 调用。
		dispatch: () => new Promise(() => {}),
	});
	transports.push(transport);

	await waitFor(() => stub.requests.some((item) => item.path === "/result"));

	const posted = stub.requests.find((item) => item.path === "/result");
	expect(posted?.body).toMatchObject({
		id: "c3",
		ok: false,
		error: {
			class: "timeout",
			message:
				"page.navigate did not finish within 20ms; the debugger was detached, so the page may be half changed",
		},
	});
	// 放弃之后循环必须接着转：再问一次桥，而不是卡在放弃的那条命令上。
	await waitFor(
		() => stub.requests.filter((item) => item.path === "/next").length >= 3,
	);
});

it("命令到手时预算已经用完就立刻放弃，不跑 dispatch", async () => {
	const stub = await startStubBridge([
		{
			type: "command",
			command: { id: "c4", action: "tab.list", remainingMs: 0 },
		},
	]);
	const dispatch = vi.fn(() => undefined);
	const transport = startTransport({
		url: stub.url,
		pollIntervalMs: 100,
		version: HOST_VERSION,
		dispatch,
	});
	transports.push(transport);

	await waitFor(() => stub.requests.some((item) => item.path === "/result"));

	expect(dispatch).not.toHaveBeenCalled();
	expect(stub.requests.find((item) => item.path === "/result")?.body).toEqual({
		id: "c4",
		ok: false,
		error: {
			class: "timeout",
			message: "the command expired before the extension started it",
		},
	});
});

it("请求超过时限就结束循环，等下一次唤醒重起", async () => {
	const server = createServer(() => {
		// 收下请求但不答：模拟半死的连接。
	});
	servers.push(server);
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	const port =
		typeof address === "object" && address !== null ? address.port : 0;

	const transport = startTransport({
		url: `http://127.0.0.1:${port}`,
		pollIntervalMs: 10,
		requestTimeoutMs: 50,
		version: HOST_VERSION,
		dispatch: () => undefined,
	});
	transports.push(transport);

	await expect(
		Promise.race([
			transport.done.then(() => "done"),
			sleep(2_000).then(() => "still polling"),
		]),
	).resolves.toBe("done");
});

it("AC5: 加载入口就把 alarm 设成每 0.5 分钟一次，并用每秒一次的定时器叫轮询", async () => {
	const chrome = stubChrome({ version: "0.1.0" });
	const keepalive = vi
		.spyOn(globalThis, "setInterval")
		.mockReturnValue(0 as unknown as ReturnType<typeof setInterval>);

	await import(extensionUrl("index.js"));

	expect(chrome.alarms.create).toHaveBeenCalledWith("pi-browser-use:poll", {
		periodInMinutes: 0.5,
	});
	expect(keepalive).toHaveBeenCalledWith(expect.any(Function), 1_000);
});

it("AC6: 握手报的版本与宿主不同，后续 send 以 extension_version 拒绝且不发命令", async () => {
	const bridge = await startPaired("9.9.9");

	const rejection = await bridge.send("tab.list").then(
		() => undefined,
		(caught: unknown) => caught as BridgeError,
	);

	expect(rejection).toBeInstanceOf(BridgeError);
	expect(rejection?.details.error.class).toBe("extension_version");
	expect(rejection?.message).toContain("9.9.9");
	expect(rejection?.message).toContain(HOST_VERSION);
	expect(bridge.status().queuedCommands).toBe(0);
});

it("扩展与桥用同一个版本头名", () => {
	expect(VERSION_HEADER).toBe(EXTENSION_VERSION_HEADER);
	expect(EXTENSION_HOST_VERSION_HEADER).toBe(HOST_VERSION_HEADER);
});

it("桥期望的版本更新时重载自己，并且不取命令", async () => {
	const stub = await startStubBridge(
		[{ type: "command", command: { id: "c3", action: "tab.list" } }],
		"0.2.0",
	);
	const chrome = stubChrome({ version: "0.1.0" });
	const dispatch = vi.fn(() => []);
	transports.push(
		startTransport({
			url: stub.url,
			pollIntervalMs: 20,
			version: "0.1.0",
			dispatch,
		}),
	);

	await waitFor(() => chrome.runtime.reload.mock.calls.length === 1);

	expect(dispatch).not.toHaveBeenCalled();
	expect(chrome.storage.local.set).toHaveBeenCalledWith({
		"transport.reloadedFor": "0.2.0",
	});
});

it("磁盘上仍是旧代码时不再重载，只报错停下", async () => {
	const stub = await startStubBridge([], "0.2.0");
	const chrome = stubChrome({ version: "0.1.0" });
	const start = () =>
		startTransport({
			url: stub.url,
			pollIntervalMs: 20,
			version: "0.1.0",
			dispatch: () => undefined,
		});

	const first = start();
	transports.push(first);
	await waitFor(() => chrome.runtime.reload.mock.calls.length === 1);
	await first.done;

	// 同一份 storage：第二次已经知道重载过一次，不再重载。
	await start().done;

	expect(chrome.runtime.reload).toHaveBeenCalledTimes(1);
});

it("版本对不上时 /next 不发命令，先入队的也留着", async () => {
	const bridge = new Bridge({ port: 0, holdMs: 20, hostVersion: HOST_VERSION });
	bridges.push(bridge);
	await bridge.start();

	const sending = bridge.send("tab.list", undefined, { timeoutMs: 100 });
	const failure = sending.then(
		() => undefined,
		(caught: unknown) => caught,
	);

	const body = await fetch(`${bridge.url}/next`, {
		headers: { [EXTENSION_VERSION_HEADER]: "9.9.9" },
	}).then((response) => response.json() as Promise<NextBody>);

	expect(body).toEqual({ type: "none" });
	expect(bridge.status().queuedCommands).toBe(1);
	expect(await failure).toBeInstanceOf(BridgeError);
});

it("版本相同就把命令交给扩展", async () => {
	const bridge = new Bridge({ port: 0, holdMs: 50, hostVersion: HOST_VERSION });
	bridges.push(bridge);
	await bridge.start();

	// 报一次与宿主一致的版本。桥只在版本一致时才发命令。
	await fetch(`${bridge.url}/next`, {
		headers: { [EXTENSION_VERSION_HEADER]: HOST_VERSION },
	});

	const sending = bridge.send("tab.list");
	const body = await nextBody(bridge.url);
	expect(body.command?.action).toBe("tab.list");
	if (body.command === undefined) throw new Error("bridge did not queue");
	await postResult(bridge.url, { id: body.command.id, ok: true, result: [] });

	expect(await sending).toEqual([]);
});
