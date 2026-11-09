/**
 * 本地 HTTP 桥的门面：组装端口归属（ownership）、命令队列（queue）与四个端点（http）。
 * SPEC-0001 桥协议：命令按发起顺序串行入队，一次 `GET /next` 只取一条。
 * 本模块不认识工具语义，只搬运 action 与 params。
 */

import { randomUUID } from "node:crypto";
import {
	type ActionName,
	BridgeError,
	type BridgeStatus,
	CONNECTED_WINDOW_MS,
	DEFAULT_COMMAND_TIMEOUT_MS,
	DEFAULT_HOLD_MS,
	type ErrorClass,
	FIRST_POLL_GRACE_MS,
	type ForwardRequest,
	type ForwardResponse,
} from "../protocol/index.ts";
import { bridgeErrorFrom, createHandler } from "./http.ts";
import { BridgeOwnership } from "./ownership.ts";
import { CommandQueue, type PendingEntry } from "./queue.ts";

/** 等首次轮询时，两次 `describe()` 之间的间隔。 */
const FIRST_POLL_WAIT_MS = 100;

/** 四种取消路径共用一句，免得同一件事有几种说法。 */
const ABORTED = "the caller aborted the command";

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

export class Bridge {
	readonly holdMs: number;
	private readonly hostVersion: string;
	private readonly owner: BridgeOwnership;
	private readonly commands = new CommandQueue();
	private lastSeenAt: number | undefined;
	private extensionVersion: string | undefined;
	private versionMismatch = false;

	constructor(options: BridgeOptions) {
		this.holdMs = options.holdMs ?? DEFAULT_HOLD_MS;
		this.hostVersion = options.hostVersion;
		this.owner = new BridgeOwnership({
			port: options.port,
			handler: createHandler({
				url: () => this.url,
				status: () => this.status(),
				holdMs: this.holdMs,
				hostVersion: this.hostVersion,
				onPoll: (reportedVersion) => this.onPoll(reportedVersion),
				versionMismatch: () => this.versionMismatch,
				sendLocal: (action, params, sendOptions) =>
					this.sendLocal(action, params, sendOptions),
				commands: this.commands,
			}),
		});
	}

	/** 服务地址。`start()` 之后端口才是真实值。 */
	get url(): string {
		return this.owner.url;
	}

	get connected(): boolean {
		return (
			this.lastSeenAt !== undefined &&
			Date.now() - this.lastSeenAt < CONNECTED_WINDOW_MS
		);
	}

	/** 绑端口。端口已被同包的桥占着就退成 client，被别的进程占着就抛错。 */
	async start(): Promise<void> {
		await this.owner.listen();
	}

	/** 停服务。在途命令与排队命令都以 `bridge_unreachable` 结束，挂起的 `/next` 立刻返回。 */
	async stop(): Promise<void> {
		this.commands.cancelAll();
		for (const entry of this.commands.entries())
			this.commands.fail(
				entry,
				new BridgeError("bridge_unreachable", "the bridge stopped mid-command"),
			);
		await this.owner.close();
	}

	status(): BridgeStatus {
		return {
			mode: this.owner.mode,
			url: this.url,
			connected: this.connected,
			lastSeenAt: this.lastSeenAt,
			queuedCommands: this.commands.queuedCount,
			pendingCommands: this.commands.pendingCount,
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
		const seen = await this.owner.probe();
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
		const mode = this.owner.mode;
		if (mode === "client") return this.sendViaOwner(action, params, options);
		if (mode !== "server")
			return Promise.reject(
				new BridgeError(
					"bridge_unreachable",
					`the bridge is not running (${mode})`,
				),
			);
		return this.sendLocal(action, params, options);
	}

	private sendLocal(
		action: ActionName,
		params: Record<string, unknown> | undefined,
		options: { timeoutMs?: number; signal?: AbortSignal },
	): Promise<unknown> {
		const { signal, timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS } = options;
		if (this.versionMismatch)
			return Promise.reject(
				new BridgeError(
					"extension_version",
					`extension ${this.extensionVersion}, package ${this.hostVersion}; reload the unpacked extension`,
				),
			);
		if (signal?.aborted)
			return Promise.reject(new BridgeError("aborted", ABORTED));

		const expiresAt = Date.now() + timeoutMs;
		return new Promise<unknown>((resolveSend, rejectSend) => {
			const onAbort = () =>
				this.commands.fail(entry, new BridgeError("aborted", ABORTED));
			const entry: PendingEntry = {
				command: { id: randomUUID(), action, params },
				expiresAt,
				timer: setTimeout(() => this.expire(entry), timeoutMs),
				detach: () => signal?.removeEventListener("abort", onAbort),
				resolve: resolveSend,
				reject: rejectSend,
			};
			signal?.addEventListener("abort", onAbort, { once: true });
			this.commands.add(entry);
		});
	}

	/** 把命令转给 owner 执行。owner 没了就抢端口自己当 server，再把命令发本地。 */
	private async sendViaOwner(
		action: ActionName,
		params: Record<string, unknown> | undefined,
		options: SendOptions,
	): Promise<unknown> {
		const { signal, timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS } = options;
		if (signal?.aborted) throw new BridgeError("aborted", ABORTED);

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
				error?: string | { class: ErrorClass; message: string };
			};
			if (response.status === 403)
				throw new BridgeError(
					"bridge_unreachable",
					"the bridge accepts local processes only",
				);
			if (body.ok === true && response.ok) return body.result;
			if (typeof body.error === "object" && body.error !== null)
				throw bridgeErrorFrom(body.error);
			throw new BridgeError(
				"bridge_unreachable",
				`the bridge owner answered HTTP ${response.status} without an error body`,
			);
		} catch (error) {
			if (error instanceof BridgeError) throw error;
			if (signal?.aborted) throw new BridgeError("aborted", ABORTED);
			if (controller.signal.aborted)
				throw new BridgeError("timeout", `no result within ${timeoutMs}ms`);
			if (!isOwnerUnreachable(error)) throw error;
			await this.owner.ensureServer();
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

	/** 扩展每次轮询：记时间，记版本，据此决定后续命令能不能发。重载扩展后新版会清掉标记。 */
	private onPoll(reportedVersion: string | undefined): void {
		this.lastSeenAt = Date.now();
		if (reportedVersion === undefined) return;
		this.extensionVersion = reportedVersion;
		this.versionMismatch = reportedVersion !== this.hostVersion;
	}

	private expire(entry: PendingEntry): void {
		this.commands.fail(
			entry,
			new BridgeError("timeout", this.timeoutReason(entry)),
		);
	}

	/** 三种失败原因各用一句话，模型据此判断是扩展没在跑还是取走后挂了。 */
	private timeoutReason(entry: PendingEntry): string {
		if (entry.deliveredAt !== undefined)
			return "the extension took the command but never returned a result";
		if (this.lastSeenAt === undefined)
			return "the extension is not polling the bridge";
		return "the extension polled the bridge but did not pick up the command";
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
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
