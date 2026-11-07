/**
 * 本地 HTTP 桥。SPEC-0001 桥协议：命令按发起顺序串行入队，一次 `GET /next` 只取一条。
 * 本模块不认识工具语义，只搬运 action 与 params。
 */

import { randomUUID } from "node:crypto";
import {
	createServer,
	type IncomingMessage,
	type Server,
	type ServerResponse,
} from "node:http";
import {
	type ActionName,
	type BridgeCommand,
	type BridgeMode,
	type BridgeResult,
	type BridgeStatus,
	CONNECTED_WINDOW_MS,
	DEFAULT_HOLD_MS,
	type NextResponse,
} from "../protocol/index.ts";

/** 桥只绑回环地址，host 不开放配置。 */
const HOST = "127.0.0.1";

export interface BridgeOptions {
	/** 端口。传 0 让系统分配，测试用。 */
	port: number;
	/** `/next` 的挂起时长，默认 {@link DEFAULT_HOLD_MS}。 */
	holdMs?: number;
}

interface Waiter {
	resolve: (command: BridgeCommand | undefined) => void;
	/** 撤掉这次等待：清定时器并 settle，长轮询断线或停服时用。 */
	cancel: () => void;
}

interface PendingEntry {
	resolve: (value: unknown) => void;
	reject: (error: Error) => void;
}

export class Bridge {
	readonly holdMs: number;
	private readonly requestedPort: number;
	private server: Server | undefined;
	private port = 0;
	private queue: BridgeCommand[] = [];
	private waiters: Waiter[] = [];
	private pending = new Map<string, PendingEntry>();
	private lastSeenAt: number | undefined;
	private state: BridgeMode = "starting";

	constructor(options: BridgeOptions) {
		this.requestedPort = options.port;
		this.holdMs = options.holdMs ?? DEFAULT_HOLD_MS;
	}

	/** 服务地址。`start()` 之后端口才是真实值。 */
	get url(): string {
		return `http://${HOST}:${this.port}`;
	}

	get connected(): boolean {
		return (
			this.lastSeenAt !== undefined &&
			Date.now() - this.lastSeenAt < CONNECTED_WINDOW_MS
		);
	}

	async start(): Promise<void> {
		if (this.server !== undefined) return;
		const server = createServer((request, response) => {
			void this.handle(request, response).catch((error: Error) => {
				sendJson(response, 500, { ok: false, error: error.message });
			});
		});
		await new Promise<void>((resolveStart, rejectStart) => {
			server.once("error", rejectStart);
			server.listen(this.requestedPort, HOST, () => {
				server.off("error", rejectStart);
				resolveStart();
			});
		});
		const address = server.address();
		this.port =
			typeof address === "object" && address !== null
				? address.port
				: this.requestedPort;
		this.server = server;
		this.state = "server";
	}

	/** 停服务。在途命令与排队命令都以错误结束，挂起的 `/next` 立刻返回。 */
	async stop(): Promise<void> {
		for (const waiter of this.waiters) waiter.cancel();
		this.waiters = [];
		this.state = "stopped";
		this.queue = [];
		for (const entry of this.pending.values())
			entry.reject(new Error("bridge stopped"));
		this.pending.clear();
		const server = this.server;
		this.server = undefined;
		if (server === undefined) return;
		await new Promise<void>((resolveClose) =>
			server.close(() => resolveClose()),
		);
	}

	status(): BridgeStatus {
		return {
			mode: this.state,
			url: this.url,
			connected: this.connected,
			lastSeenAt: this.lastSeenAt,
			queuedCommands: this.queue.length,
			pendingCommands: this.pending.size,
		};
	}

	/** 发一条命令，返回它的应答。桥没在服务时立刻被拒，不排队等一个永远不会来的投递方。 */
	send(action: ActionName, params?: Record<string, unknown>): Promise<unknown> {
		if (this.state !== "server")
			return Promise.reject(new Error(`bridge is not running (${this.state})`));
		const command: BridgeCommand = { id: randomUUID(), action, params };
		return new Promise<unknown>((resolveSend, rejectSend) => {
			this.pending.set(command.id, {
				resolve: resolveSend,
				reject: rejectSend,
			});
			const waiter = this.waiters.shift();
			if (waiter === undefined) this.queue.push(command);
			else waiter.resolve(command);
		});
	}

	private async handle(
		request: IncomingMessage,
		response: ServerResponse,
	): Promise<void> {
		const url = new URL(request.url ?? "/", this.url);
		if (request.method === "GET" && url.pathname === "/status") {
			sendJson(response, 200, this.status());
			return;
		}
		if (request.method === "GET" && url.pathname === "/next") {
			await this.handleNext(request, response);
			return;
		}
		if (request.method === "POST" && url.pathname === "/result") {
			await this.handleResult(request, response);
			return;
		}
		sendJson(response, 404, { ok: false, error: "not found" });
	}

	private async handleNext(
		request: IncomingMessage,
		response: ServerResponse,
	): Promise<void> {
		this.lastSeenAt = Date.now();
		let closed = false;
		let active: Waiter | undefined;
		const onClose = () => {
			closed = true;
			if (active === undefined) return;
			this.waiters = this.waiters.filter((item) => item !== active);
			active.cancel();
		};
		request.once("close", onClose);

		const command =
			this.queue.shift() ??
			(await this.waitForCommand((waiter) => (active = waiter)));

		request.off("close", onClose);
		if (closed) {
			// 长轮询在投递前断线：把取走的命令放回队首，别丢。
			if (command !== undefined) this.queue.unshift(command);
			return;
		}
		const body: NextResponse =
			command === undefined ? { type: "none" } : { type: "command", command };
		sendJson(response, 200, body);
	}

	private waitForCommand(
		register?: (waiter: Waiter) => void,
	): Promise<BridgeCommand | undefined> {
		return new Promise<BridgeCommand | undefined>((resolveWait) => {
			const waiter: Waiter = {
				resolve: (command) => {
					clearTimeout(timer);
					resolveWait(command);
				},
				cancel: () => {
					clearTimeout(timer);
					resolveWait(undefined);
				},
			};
			const timer = setTimeout(() => {
				this.waiters = this.waiters.filter((item) => item !== waiter);
				resolveWait(undefined);
			}, this.holdMs);
			this.waiters.push(waiter);
			register?.(waiter);
		});
	}

	private async handleResult(
		request: IncomingMessage,
		response: ServerResponse,
	): Promise<void> {
		const result = JSON.parse(await readBody(request)) as BridgeResult;
		const entry = this.pending.get(result.id);
		if (entry === undefined) {
			sendJson(response, 404, { ok: false, error: "unknown command id" });
			return;
		}
		this.pending.delete(result.id);
		if (result.ok) entry.resolve(result.result);
		else entry.reject(new Error(result.error ?? "command failed"));
		sendJson(response, 200, { ok: true });
	}
}

function sendJson(
	response: ServerResponse,
	status: number,
	body: unknown,
): void {
	response.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store",
	});
	response.end(JSON.stringify(body));
}

async function readBody(request: IncomingMessage): Promise<string> {
	const chunks: Buffer[] = [];
	for await (const chunk of request) chunks.push(chunk as Buffer);
	return Buffer.concat(chunks).toString("utf-8");
}
