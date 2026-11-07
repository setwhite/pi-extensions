import { createServer } from "node:http";
import { createServer as createTcpServer } from "node:net";
import { afterEach, expect, it } from "vitest";
import { Bridge } from "../../src/bridge/index.ts";
import { HOST_VERSION } from "../../src/config/index.ts";
import { BridgeError, type ForwardResponse } from "../../src/protocol/index.ts";

const bridges: Bridge[] = [];
const closers: Array<() => Promise<void>> = [];

/** 登记一个临时服务，返回的 close 也把它从收尾清单里摘掉。 */
function track(close: () => Promise<void>): () => Promise<void> {
	closers.push(close);
	return () => {
		const index = closers.indexOf(close);
		if (index >= 0) closers.splice(index, 1);
		return close();
	};
}

interface NextBody {
	type: "command" | "none";
	command?: { id: string; action: string; params?: Record<string, unknown> };
}

function portOf(url: string): number {
	return Number(new URL(url).port);
}

async function startBridge(port: number): Promise<Bridge> {
	const bridge = new Bridge({ port, holdMs: 50, hostVersion: HOST_VERSION });
	bridges.push(bridge);
	await bridge.start();
	return bridge;
}

/** 起一个不是本包的 HTTP 服务，占住端口。传 0 让系统分配。 */
async function startForeignServer(
	port = 0,
): Promise<{ port: number; close: () => Promise<void> }> {
	const server = createServer((_request, response) => {
		response.writeHead(200, { "content-type": "text/plain" });
		response.end("not the bridge");
	});
	await new Promise<void>((resolve) =>
		server.listen(port, "127.0.0.1", resolve),
	);
	const address = server.address();
	return {
		port: typeof address === "object" && address !== null ? address.port : 0,
		close: track(
			() => new Promise<void>((resolve) => server.close(() => resolve())),
		),
	};
}

/** 占住端口但不答应答：连接一建立就断，让 fetch 在连接层失败。 */
async function startDeadPort(
	port = 0,
): Promise<{ port: number; close: () => Promise<void> }> {
	const server = createTcpServer((socket) => socket.destroy());
	await new Promise<void>((resolve) =>
		server.listen(port, "127.0.0.1", resolve),
	);
	const address = server.address();
	return {
		port: typeof address === "object" && address !== null ? address.port : 0,
		close: track(
			() => new Promise<void>((resolve) => server.close(() => resolve())),
		),
	};
}

function next(
	url: string,
	headers?: Record<string, string>,
): Promise<NextBody> {
	return fetch(`${url}/next`, { headers }).then(
		(response) => response.json() as Promise<NextBody>,
	);
}

function postResult(
	url: string,
	body: unknown,
	headers?: Record<string, string>,
): Promise<Response> {
	return fetch(`${url}/result`, {
		method: "POST",
		headers: { "content-type": "application/json", ...headers },
		body: JSON.stringify(body),
	});
}

function postCommand(url: string, body: unknown): Promise<Response> {
	return fetch(`${url}/command`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(
	condition: () => boolean,
	timeoutMs = 2_000,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!condition()) {
		if (Date.now() > deadline) throw new Error("condition not met in time");
		await sleep(5);
	}
}

/** 起一个 server 与一个指向它的 client，client 已 start。 */
async function startPair(): Promise<{ owner: Bridge; client: Bridge }> {
	const owner = await startBridge(0);
	const port = portOf(owner.url);
	const client = new Bridge({ port, holdMs: 50, hostVersion: HOST_VERSION });
	bridges.push(client);
	await client.start();
	return { owner, client };
}

afterEach(async () => {
	for (const bridge of bridges.splice(0)) await bridge.stop();
	for (const close of closers.splice(0)) await close();
});

it("AC2: 端口已被同包桥占用时，第二个实例的 mode 是 client", async () => {
	const owner = await startBridge(0);
	const port = portOf(owner.url);
	const second = new Bridge({ port, hostVersion: HOST_VERSION });
	bridges.push(second);

	await second.start();

	expect(owner.status().mode).toBe("server");
	expect(second.status().mode).toBe("client");
	expect(second.url).toBe(owner.url);
});

it("AC3: client 发的命令出现在 owner 的 /next，结果回到 client", async () => {
	const { owner, client } = await startPair();

	const sending = client.send("page.snapshot", { mode: "refs" });
	const body = await next(owner.url);
	expect(body.type).toBe("command");
	const command = body.command;
	if (command === undefined) throw new Error("owner did not receive a command");
	expect(command.action).toBe("page.snapshot");
	expect(command.params).toEqual({ mode: "refs" });

	const posted = await postResult(owner.url, {
		id: command.id,
		ok: true,
		result: { path: "/tmp/shot.png" },
	});
	expect(posted.status).toBe(200);
	expect(await sending).toEqual({ path: "/tmp/shot.png" });
});

it("AC4: owner 停掉后，client 的 send 仍成功，且 mode 变成 server", async () => {
	const { owner, client } = await startPair();
	const port = portOf(owner.url);
	expect(portOf(client.url)).toBe(port);

	await owner.stop();

	const sending = client.send("tab.list");
	await waitFor(() => client.status().mode === "server");

	const body = await next(client.url);
	expect(body.type).toBe("command");
	const command = body.command;
	if (command === undefined) throw new Error("promoted bridge did not queue");
	const posted = await postResult(client.url, {
		id: command.id,
		ok: true,
		result: [{ id: 1, title: "Example" }],
	});
	expect(posted.status).toBe(200);
	expect(await sending).toEqual([{ id: 1, title: "Example" }]);
});

it("owner 消失后两条并发的 send 都能完成，mode 不卡在 starting", async () => {
	const { owner, client } = await startPair();
	await owner.stop();

	const settled = Promise.allSettled([
		client.send("tab.list"),
		client.send("page.snapshot"),
	]);
	await waitFor(() => client.status().mode === "server");

	for (const _ of [0, 1]) {
		const body = await next(client.url);
		const command = body.command;
		if (command === undefined) throw new Error("promoted bridge did not queue");
		await postResult(client.url, { id: command.id, ok: true, result: [] });
	}

	expect(await settled).toEqual([
		{ status: "fulfilled", value: [] },
		{ status: "fulfilled", value: [] },
	]);
	expect(client.status().mode).toBe("server");
});

it("抢占失败不卡死：端口腾出来后下一次 send 能升为 server", async () => {
	const { owner, client } = await startPair();
	await owner.stop();

	// 端口刚空出来就被别的进程占住，这一次抢不到。
	const foreign = await startDeadPort(portOf(owner.url));

	const failed = await client.send("tab.list").then(
		() => undefined,
		(error: unknown) => error as BridgeError,
	);
	expect(failed?.details.error.class).toBe("bridge_unreachable");
	expect(client.status().mode).toBe("client");

	await foreign.close();

	const sending = client.send("tab.list");
	await waitFor(() => client.status().mode === "server");
	const body = await next(client.url);
	const command = body.command;
	if (command === undefined) throw new Error("promoted bridge did not queue");
	await postResult(client.url, { id: command.id, ok: true, result: [] });

	expect(await sending).toEqual([]);
	expect(client.status().mode).toBe("server");
});

it("AC5: 带非扩展 Origin 的 GET /next 返回 403", async () => {
	const bridge = await startBridge(50);

	const response = await fetch(`${bridge.url}/next`, {
		headers: { origin: "https://evil.example" },
	});

	expect(response.status).toBe(403);
});

it("AC6: 端口被非本包进程占用时启动即报 bridge_unreachable，不静默换端口", async () => {
	const foreign = await startForeignServer();

	const bridge = new Bridge({ port: foreign.port, hostVersion: HOST_VERSION });
	bridges.push(bridge);

	const error = await bridge.start().then(
		() => undefined,
		(caught: unknown) => caught,
	);

	expect(error).toBeInstanceOf(BridgeError);
	const bridgeError = error as BridgeError;
	expect(bridgeError.details.error.class).toBe("bridge_unreachable");
	expect(bridgeError.message).toContain("bridge.port");
	expect(bridgeError.details.error.hint).toContain("bridge.port");
	expect(bridge.status().mode).toBe("starting");
});

it("AC7: 带非扩展 Origin 的 POST /result 返回 403", async () => {
	const bridge = await startBridge(50);
	const sending = bridge.send("tab.list", undefined, { timeoutMs: 2_000 });
	sending.catch(() => undefined);
	const body = await next(bridge.url);
	const command = body.command;
	if (command === undefined) throw new Error("bridge did not queue");

	const response = await postResult(
		bridge.url,
		{ id: command.id, ok: true, result: [] },
		{ origin: "https://evil.example" },
	);

	expect(response.status).toBe(403);
	// 被拒的请求不动在途表：真结果仍能回来。
	const accepted = await postResult(bridge.url, {
		id: command.id,
		ok: true,
		result: [],
	});
	expect(accepted.status).toBe(200);
	expect(await sending).toEqual([]);
});

it("/command 只接受本机进程，带 Origin 的请求返回 403", async () => {
	const owner = await startBridge(0);

	const response = await fetch(`${owner.url}/command`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			origin: "https://evil.example",
		},
		body: JSON.stringify({ action: "tab.list" }),
	});

	expect(response.status).toBe(403);
});

it("/command 让本机进程借 owner 的连接执行命令", async () => {
	const owner = await startBridge(0);
	const sending = postCommand(owner.url, {
		action: "tab.list",
		timeoutMs: 50,
	}).then((response) => response.json() as Promise<ForwardResponse>);
	const body = await next(owner.url);
	const command = body.command;
	if (command === undefined) throw new Error("owner did not queue");

	await postResult(owner.url, { id: command.id, ok: true, result: [] });

	expect(await sending).toEqual({ ok: true, result: [] });
});
