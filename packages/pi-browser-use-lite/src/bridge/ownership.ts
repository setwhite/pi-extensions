/**
 * 端口归属：同一个 `127.0.0.1:17318` 上先到者当 server，其余当 client 转发。
 * owner 消失时 client 抢端口升为 server；并发发现时共用同一次抢占。
 */

import {
	createServer,
	type IncomingMessage,
	type Server,
	type ServerResponse,
} from "node:http";
import {
	BridgeError,
	type BridgeMode,
	type BridgeStatus,
} from "../protocol/index.ts";

/** 桥只绑回环地址，host 不开放配置。 */
const HOST = "127.0.0.1";

/** 探端口或问 owner 时，等它答 `/status` 的时限。 */
const STATUS_PROBE_MS = 1_000;

export interface OwnershipOptions {
	/** 端口。传 0 让系统分配，测试用。 */
	port: number;
	/** 起服务时挂的请求处理函数。 */
	handler: (request: IncomingMessage, response: ServerResponse) => void;
}

export class BridgeOwnership {
	private readonly requestedPort: number;
	private readonly handler: (
		request: IncomingMessage,
		response: ServerResponse,
	) => void;
	private server: Server | undefined;
	/** 进行中的抢占。 */
	private promotion: Promise<void> | undefined;
	private boundPort = 0;
	private state: BridgeMode = "starting";

	constructor(options: OwnershipOptions) {
		this.requestedPort = options.port;
		this.handler = options.handler;
	}

	/** 当前身份。读 getter 不读字段：`listen()` 里的 await 会改它。 */
	get mode(): BridgeMode {
		return this.state;
	}

	get url(): string {
		return `http://${HOST}:${this.boundPort}`;
	}

	/** 绑端口。端口已被同包的桥占着就退成 client，被别的进程占着就抛错。 */
	async listen(): Promise<void> {
		if (this.server !== undefined || this.state === "client") return;
		const server = createServer(this.handler);
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
		this.boundPort =
			typeof address === "object" && address !== null
				? address.port
				: this.requestedPort;
		this.server = server;
		this.state = "server";
	}

	/** 抢过端口自己当 server。抢不到就把原因抛出去，不静默留在 client。 */
	async ensureServer(): Promise<void> {
		if (this.mode === "server") return;
		if (this.mode === "stopped")
			throw new BridgeError(
				"bridge_unreachable",
				"the bridge stopped mid-command",
			);
		this.promotion ??= this.takePort().finally(() => {
			this.promotion = undefined;
		});
		return this.promotion;
	}

	/** 停服务。挂起的 `/next` 由门面先撤掉。 */
	async close(): Promise<void> {
		this.state = "stopped";
		const server = this.server;
		this.server = undefined;
		if (server === undefined) return;
		await new Promise<void>((resolveClose) =>
			server.close(() => resolveClose()),
		);
	}

	/** 读 owner 的 `/status`。读不到（拒绝、超时、形状不对）返回 `undefined`。 */
	async probe(): Promise<BridgeStatus | undefined> {
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
		this.boundPort = this.requestedPort;
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

	/** 抢占本体：绑上端口就当 server，被别人抢先就复位成 client 再抛错。 */
	private async takePort(): Promise<void> {
		this.state = "starting";
		try {
			await this.listen();
		} catch (error) {
			this.state = "client";
			throw error instanceof BridgeError
				? error
				: new BridgeError(
						"bridge_unreachable",
						`could not take over the bridge port: ${(error as Error).message}`,
					);
		}
		if (this.mode === "server") return;
		this.state = "client";
		throw new BridgeError(
			"bridge_unreachable",
			`the session that owned the bridge at ${this.url} is gone and another process took the port first`,
		);
	}
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
