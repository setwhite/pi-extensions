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
	BridgeError,
	type BridgeErrorClass,
	type BridgeMode,
	type BridgeResult,
	type BridgeStatus,
	CONNECTED_WINDOW_MS,
	DEFAULT_COMMAND_TIMEOUT_MS,
	DEFAULT_HOLD_MS,
	EXTENSION_VERSION_HEADER,
	FIRST_POLL_GRACE_MS,
	type ForwardRequest,
	type ForwardResponse,
	HOST_VERSION_HEADER,
	type NextResponse,
} from "../protocol/index.ts";

/** 桥只绑回环地址，host 不开放配置。 */
const HOST = "127.0.0.1";

/** 探端口或问 owner 时，等它答 `/status` 的时限。 */
const STATUS_PROBE_MS = 1_000;

/** 等首次轮询时，两次 `describe()` 之间的间隔。 */
const FIRST_POLL_WAIT_MS = 100;

export interface BridgeOptions {
	/** 端口。传 0 让系统分配，测试用。 */
	port: number;
	/** 宿主版本，用 {@link HOST_VERSION}。扩展报回的版本与它不一致就拒绝后续命令。 */
	hostVersion: string;
	/** `/next` 的挂起时长，默认 {@link DEFAULT_HOLD_MS}。 */
	holdMs?: number;
}

export interface SendOptions {
	/** 超时从入队时刻算。默认 {@link DEFAULT_COMMAND_TIMEOUT_MS}。 */
	timeoutMs?: number;
	/** 取消。触发后命令出队，不再投递给扩展。 */
	signal?: AbortSignal;
}

interface Waiter {
	resolve: (entry: PendingEntry | undefined) => void;
	/** 撤掉这次等待：清定时器并 settle，长轮询断线或停服时用。 */
	cancel: () => void;
}

/** 排队中的命令。`remainingMs` 要到交给扩展的那一刻才成立，见 `/next`。 */
type QueuedCommand = Omit<BridgeCommand, "remainingMs">;

/** 交命令时预留给扩展回传结果的时间：命令自己的时限先到，调用方才能拿到具体原因而不是桥的超时文案。 */
const RESULT_GRACE_MS = 500;

interface PendingEntry {
	command: QueuedCommand;
	/** 命令到期时刻。调用方与扩展共用这一个预算。 */
	expiresAt: number;
	deliveredAt?: number;
	timer: NodeJS.Timeout;
	detach: () => void;
	resolve: (value: unknown) => void;
	reject: (error: Error) => void;
}

export class Bridge {
	readonly holdMs: number;
	private readonly requestedPort: number;
	private readonly hostVersion: string;
	private server: Server | undefined;
	private port = 0;
	private queue: PendingEntry[] = [];
	private waiters: Waiter[] = [];
	private pending = new Map<string, PendingEntry>();
	private lastSeenAt: number | undefined;
	private state: BridgeMode = "starting";
	/** 进行中的抢占。并发发现 owner 消失时共用这一次，不各抢一遍。 */
	private promotion: Promise<void> | undefined;
	private extensionVersion: string | undefined;
	private versionMismatch = false;

	constructor(options: BridgeOptions) {
		this.requestedPort = options.port;
		this.holdMs = options.holdMs ?? DEFAULT_HOLD_MS;
		this.hostVersion = options.hostVersion;
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

	/** 绑端口。端口已被同包的桥占着就退成 client，被别的进程占着就抛错。 */
	async start(): Promise<void> {
		if (this.server !== undefined || this.state === "client") return;
		const server = createServer((request, response) => {
			void this.handle(request, response).catch((error: Error) => {
				sendJson(response, 500, { ok: false, error: error.message });
			});
		});
		try {
			await new Promise<void>((resolveStart, rejectStart) => {
				server.once("error", rejectStart);
				server.listen(this.requestedPort, HOST, () => {
					server.off("error", rejectStart);
					resolveStart();
				});
			});
		} catch (error) {
			server.close();
			await this.bindAsClientOrFail(error);
			return;
		}
		const address = server.address();
		this.port =
			typeof address === "object" && address !== null
				? address.port
				: this.requestedPort;
		this.server = server;
		this.state = "server";
	}

	/**
	 * 绑不上端口时的两条路：同包的桥占着就当它的 client，别的进程占着就报错。
	 * 不静默换端口：扩展轮询的地址是固定的，换了端口它找不到。
	 */
	private async bindAsClientOrFail(error: unknown): Promise<void> {
		const url = `http://${HOST}:${this.requestedPort}`;
		if ((error as NodeJS.ErrnoException).code !== "EADDRINUSE")
			throw new BridgeError(
				"bridge_unreachable",
				`cannot listen on ${url}: ${(error as Error).message}`,
			);
		if (!(await this.answersAsBridge(url)))
			throw new BridgeError(
				"bridge_unreachable",
				`${url} is held by a process that is not a pi-browser-use-lite bridge; set bridge.port to a free port, or quit that process`,
			);
		this.port = this.requestedPort;
		this.state = "client";
	}

	/** 端口上的进程是不是同包的桥：非本包的进程答不出这套 `/status` 字段。 */
	private async answersAsBridge(url: string): Promise<boolean> {
		try {
			const response = await fetch(`${url}/status`, {
				signal: AbortSignal.timeout(STATUS_PROBE_MS),
			});
			if (!response.ok) return false;
			const body = (await response.json()) as Partial<BridgeStatus>;
			return (
				body.url === url &&
				typeof body.mode === "string" &&
				typeof body.queuedCommands === "number" &&
				typeof body.pendingCommands === "number"
			);
		} catch {
			return false;
		}
	}

	/** 停服务。在途命令与排队命令都以 `bridge_unreachable` 结束，挂起的 `/next` 立刻返回。 */
	async stop(): Promise<void> {
		for (const waiter of this.waiters) waiter.cancel();
		this.waiters = [];
		for (const entry of [...this.pending.values()])
			this.fail(
				entry,
				new BridgeError(
					"bridge_unreachable",
					"the bridge stopped before the command finished",
				),
			);
		this.state = "stopped";
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
			extensionVersion: this.extensionVersion,
		};
	}

	/**
	 * 给 `/chrome status` 看的真实状态。client 模式本地看不见扩展，问 owner 要；
	 * owner 答不上话就退回本地视图——它没在服务，谁也算不上连着。
	 */
	async describe(): Promise<BridgeStatus> {
		const local = this.status();
		if (local.mode !== "client") return local;
		const seen = await this.askOwnerStatus();
		return seen === undefined
			? local
			: { ...seen, mode: "client", url: this.url };
	}

	/**
	 * 等扩展第一次轮询。只等从未见过的扩展：`lastSeenAt` 已定义说明它来过，
	 * 过期了就立即返回，交给调用方快速报 `extension_missing`。
	 * client 模式 `describe()` 会问 owner，所以两种模式共用这一份。
	 */
	async waitForFirstPoll(
		timeoutMs: number = FIRST_POLL_GRACE_MS,
	): Promise<BridgeStatus> {
		const deadline = Date.now() + timeoutMs;
		for (;;) {
			const status = await this.describe();
			if (status.connected || status.lastSeenAt !== undefined) return status;
			const remaining = deadline - Date.now();
			if (remaining <= 0) return status;
			await sleep(Math.min(FIRST_POLL_WAIT_MS, remaining));
		}
	}

	/**
	 * 发一条命令，返回它的应答。client 模式转发给端口上的 owner。
	 * 桥没在服务、超时、调用方取消都以 {@link BridgeError} 拒绝。
	 */
	send(
		action: ActionName,
		params?: Record<string, unknown>,
		options: SendOptions = {},
	): Promise<unknown> {
		if (this.state === "client")
			return this.sendViaOwner(action, params, options);
		if (this.state !== "server")
			return Promise.reject(
				new BridgeError(
					"bridge_unreachable",
					`the bridge is not running (${this.state})`,
				),
			);
		return this.sendLocal(action, params, options);
	}

	private sendLocal(
		action: ActionName,
		params: Record<string, unknown> | undefined,
		options: SendOptions,
	): Promise<unknown> {
		const { signal, timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS } = options;
		if (this.versionMismatch)
			return Promise.reject(
				new BridgeError(
					"extension_version",
					`the extension is on version ${this.extensionVersion} but this package is ${this.hostVersion}; reload the unpacked extension`,
				),
			);
		if (signal?.aborted)
			return Promise.reject(
				new BridgeError(
					"aborted",
					"the caller aborted before the command was sent",
				),
			);

		const command: QueuedCommand = { id: randomUUID(), action, params };
		const expiresAt = Date.now() + timeoutMs;
		return new Promise<unknown>((resolveSend, rejectSend) => {
			const onAbort = () =>
				this.fail(
					entry,
					new BridgeError("aborted", "the caller aborted the command"),
				);
			const entry: PendingEntry = {
				command,
				expiresAt,
				timer: setTimeout(() => this.expire(entry), timeoutMs),
				detach: () => signal?.removeEventListener("abort", onAbort),
				resolve: resolveSend,
				reject: rejectSend,
			};
			signal?.addEventListener("abort", onAbort, { once: true });
			this.pending.set(command.id, entry);
			const waiter = this.waiters.shift();
			if (waiter === undefined) this.queue.push(entry);
			else waiter.resolve(entry);
		});
	}

	/** 把命令转给 owner 执行。owner 没了就抢端口自己当 server，再把命令发本地。 */
	private async sendViaOwner(
		action: ActionName,
		params: Record<string, unknown> | undefined,
		options: SendOptions,
	): Promise<unknown> {
		const { signal, timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS } = options;
		if (signal?.aborted)
			throw new BridgeError(
				"aborted",
				"the caller aborted before the command was sent",
			);

		// 转发与被抢到端口后的本地重发共用这一份预算，抢端口不算新的一次调用。
		const deadline = Date.now() + timeoutMs;
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeoutMs);
		const forwardAbort = () => controller.abort();
		signal?.addEventListener("abort", forwardAbort, { once: true });
		try {
			// 取消信号过不了 HTTP，所以把超时一起转给 owner：两边同一时刻放弃，owner 不会留下命令稍后执行。
			const response = await fetch(`${this.url}/command`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					action,
					params,
					timeoutMs,
				} satisfies ForwardRequest),
				signal: controller.signal,
			});
			const body = (await response
				.json()
				.catch(() => ({}))) as Partial<ForwardResponse> & {
				error?: string | { class: BridgeErrorClass; message: string };
			};
			if (response.status === 403)
				throw new BridgeError(
					"bridge_unreachable",
					"the bridge owner refused the command: it accepts commands only from local processes",
				);
			if (body.ok === true && response.ok) return body.result;
			if (typeof body.error === "object" && body.error !== null)
				throw new BridgeError(body.error.class, body.error.message);
			throw new BridgeError(
				"bridge_unreachable",
				`the bridge owner answered HTTP ${response.status} without an error body`,
			);
		} catch (error) {
			if (error instanceof BridgeError) throw error;
			if (signal?.aborted)
				throw new BridgeError("aborted", "the caller aborted the command");
			if (controller.signal.aborted)
				throw new BridgeError(
					"timeout",
					`the bridge owner did not return a result within ${timeoutMs}ms`,
				);
			if (!isOwnerUnreachable(error)) throw error;
			await this.promoteToServer();
			const remaining = deadline - Date.now();
			if (remaining <= 0)
				throw new BridgeError(
					"timeout",
					`taking over the bridge port used up the ${timeoutMs}ms budget`,
				);
			return this.sendLocal(action, params, {
				...options,
				timeoutMs: remaining,
			});
		} finally {
			clearTimeout(timer);
			signal?.removeEventListener("abort", forwardAbort);
		}
	}

	/** 抢过端口自己当 server。抢不到就把原因抛出去，不静默留在 client。 */
	private promoteToServer(): Promise<void> {
		const mode = this.status().mode;
		if (mode === "server") return Promise.resolve();
		if (mode === "stopped")
			return Promise.reject(
				new BridgeError(
					"bridge_unreachable",
					"the bridge was stopped before the command could be forwarded",
				),
			);
		this.promotion ??= this.takePort().finally(() => {
			this.promotion = undefined;
		});
		return this.promotion;
	}

	/** 抢占本体：绑上端口就当 server，被别人抢先就复位成 client 再抛错。 */
	private async takePort(): Promise<void> {
		this.state = "starting";
		try {
			await this.start();
		} catch (error) {
			this.state = "client";
			throw error instanceof BridgeError
				? error
				: new BridgeError(
						"bridge_unreachable",
						`could not take over the bridge port: ${(error as Error).message}`,
					);
		}
		// this.state 已被上面的赋值窄化成 "starting"，经 status() 读回宽类型。
		if (this.status().mode === "server") return;
		this.state = "client";
		throw new BridgeError(
			"bridge_unreachable",
			`the session that owned the bridge at ${this.url} is gone and another process took the port first`,
		);
	}

	/** 读 owner 的 `/status`。读不到（拒绝、超时、形状不对）返回 undefined。 */
	private async askOwnerStatus(): Promise<BridgeStatus | undefined> {
		try {
			const response = await fetch(`${this.url}/status`, {
				signal: AbortSignal.timeout(STATUS_PROBE_MS),
			});
			if (!response.ok) return undefined;
			const body: unknown = await response.json();
			return isBridgeStatus(body) ? body : undefined;
		} catch {
			return undefined;
		}
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
			if (!isBrowserOriginAllowed(request)) {
				sendJson(response, 403, {
					ok: false,
					error: "browser origin not allowed",
				});
				return;
			}
			await this.handleNext(request, response);
			return;
		}
		if (request.method === "POST" && url.pathname === "/result") {
			if (!isBrowserOriginAllowed(request)) {
				sendJson(response, 403, {
					ok: false,
					error: "browser origin not allowed",
				});
				return;
			}
			await this.handleResult(request, response);
			return;
		}
		if (request.method === "POST" && url.pathname === "/command") {
			await this.handleCommand(request, response);
			return;
		}
		sendJson(response, 404, { ok: false, error: "not found" });
	}

	private async handleCommand(
		request: IncomingMessage,
		response: ServerResponse,
	): Promise<void> {
		if (!isLocalProcessRequest(request)) {
			sendJson(response, 403, {
				ok: false,
				error: "the bridge accepts commands only from local processes",
			});
			return;
		}
		const body = JSON.parse(await readBody(request)) as ForwardRequest;
		try {
			const result = await this.sendLocal(body.action, body.params, {
				timeoutMs: body.timeoutMs,
			});
			const payload: ForwardResponse = { ok: true, result };
			sendJson(response, 200, payload);
		} catch (error) {
			const bridgeError =
				error instanceof BridgeError
					? error
					: new BridgeError("page_error", (error as Error).message);
			const payload: ForwardResponse = {
				ok: false,
				error: {
					class: bridgeError.details.error.class,
					message: bridgeError.message,
				},
			};
			sendJson(response, 504, payload);
		}
	}

	private async handleNext(
		request: IncomingMessage,
		response: ServerResponse,
	): Promise<void> {
		this.lastSeenAt = Date.now();
		this.recordExtensionVersion(request);
		// 每次应答都报期望版本：扩展比自己旧就重载自己，用户不必去扩展页手动刷新。
		response.setHeader(HOST_VERSION_HEADER, this.hostVersion);
		if (this.versionMismatch) {
			// 版本对不上就不发命令：先入队的也留着，等扩展换成同一版本再来取。
			sendJson(response, 200, { type: "none" } satisfies NextResponse);
			return;
		}
		let closed = false;
		let active: Waiter | undefined;
		const onClose = () => {
			closed = true;
			if (active === undefined) return;
			this.waiters = this.waiters.filter((item) => item !== active);
			active.cancel();
		};
		request.once("close", onClose);

		const entry =
			this.queue.shift() ??
			(await this.waitForCommand((waiter) => (active = waiter)));

		request.off("close", onClose);
		if (closed) {
			// 长轮询在投递前断线：把取走的命令放回队首，别丢。
			if (entry !== undefined) this.queue.unshift(entry);
			return;
		}
		if (entry !== undefined) entry.deliveredAt = Date.now();
		const body: NextResponse =
			entry === undefined
				? { type: "none" }
				: {
						type: "command",
						command: {
							...entry.command,
							remainingMs: Math.max(
								0,
								entry.expiresAt - Date.now() - RESULT_GRACE_MS,
							),
						},
					};
		sendJson(response, 200, body);
	}

	private waitForCommand(
		register?: (waiter: Waiter) => void,
	): Promise<PendingEntry | undefined> {
		return new Promise<PendingEntry | undefined>((resolveWait) => {
			const waiter: Waiter = {
				resolve: (entry) => {
					clearTimeout(timer);
					resolveWait(entry);
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

	/** 记下扩展报回的版本，并据此决定后续命令能不能发。重载扩展后新版会清掉这个标记。 */
	private recordExtensionVersion(request: IncomingMessage): void {
		const reported = request.headers[EXTENSION_VERSION_HEADER];
		if (typeof reported !== "string" || reported === "") return;
		this.extensionVersion = reported;
		this.versionMismatch = reported !== this.hostVersion;
	}

	private async handleResult(
		request: IncomingMessage,
		response: ServerResponse,
	): Promise<void> {
		const result = JSON.parse(await readBody(request)) as BridgeResult;
		const entry = this.pending.get(result.id);
		if (entry === undefined || !this.retire(entry)) {
			sendJson(response, 404, { ok: false, error: "unknown command id" });
			return;
		}
		// 扩展的消息自带 "<class>: " 前缀，别在这里再套一层类别；认类别只在 tools/errors.ts。
		if (result.ok) entry.resolve(result.result);
		else
			entry.reject(
				new Error(
					result.error ?? "the extension reported a failure without a message",
				),
			);
		sendJson(response, 200, { ok: true });
	}

	private expire(entry: PendingEntry): void {
		this.fail(entry, new BridgeError("timeout", this.timeoutReason(entry)));
	}

	/** 三种失败原因各用一句话，模型据此判断是扩展没在跑还是取走后挂了。 */
	private timeoutReason(entry: PendingEntry): string {
		if (entry.deliveredAt !== undefined)
			return "the extension took the command but never returned a result";
		if (this.lastSeenAt === undefined)
			return "the extension is not polling the bridge";
		return "the extension polled the bridge but did not pick up the command";
	}

	private fail(entry: PendingEntry, error: Error): void {
		if (!this.retire(entry)) return;
		entry.reject(error);
	}

	/** 把命令从在途表与队列里摘掉，并清定时器与 abort 监听。已经摘过就返回 false，避免二次 settle。 */
	private retire(entry: PendingEntry): boolean {
		if (!this.pending.delete(entry.command.id)) return false;
		clearTimeout(entry.timer);
		entry.detach();
		const index = this.queue.indexOf(entry);
		if (index >= 0) this.queue.splice(index, 1);
		return true;
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
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

/** 扩展的 service worker 带 `chrome-extension://` 的 Origin，网页带的是自己站点的。 */
function isBrowserOriginAllowed(request: IncomingMessage): boolean {
	const origin = String(request.headers.origin ?? "");
	if (origin !== "") return origin.startsWith("chrome-extension://");
	const site = String(request.headers["sec-fetch-site"] ?? "");
	return site === "" || site === "none" || site === "same-origin";
}

/** 本机的 Pi 进程用 fetch，不发 Origin 与 Sec-Fetch-Site。 */
function isLocalProcessRequest(request: IncomingMessage): boolean {
	return !request.headers.origin && !request.headers["sec-fetch-site"];
}

/** owner 回的状态是不是桥的形状。字段缺了就当没答。 */
function isBridgeStatus(value: unknown): value is BridgeStatus {
	if (typeof value !== "object" || value === null) return false;
	const status = value as Partial<BridgeStatus>;
	return (
		typeof status.mode === "string" &&
		typeof status.url === "string" &&
		typeof status.connected === "boolean" &&
		typeof status.queuedCommands === "number" &&
		typeof status.pendingCommands === "number"
	);
}

/** fetch 打到已关的端口时的几种报法，命中就说明 owner 没了。 */
function isOwnerUnreachable(error: unknown): boolean {
	const candidate = error as
		| (NodeJS.ErrnoException & { cause?: NodeJS.ErrnoException })
		| undefined;
	const codes = [candidate?.code, candidate?.cause?.code];
	if (codes.includes("ECONNREFUSED") || codes.includes("ECONNRESET"))
		return true;
	return /fetch failed|ECONNREFUSED|ECONNRESET|other side closed|socket hang up/i.test(
		candidate?.message ?? "",
	);
}

async function readBody(request: IncomingMessage): Promise<string> {
	const chunks: Buffer[] = [];
	for await (const chunk of request) chunks.push(chunk as Buffer);
	return Buffer.concat(chunks).toString("utf-8");
}
