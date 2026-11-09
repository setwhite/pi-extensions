/**
 * 四个端点：`/status`、`/next`（长轮询）、`/result`、`/command`。
 * 只做校验、解析与应答。排队在 queue.ts，端口归属在 ownership.ts。
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import {
	type ActionName,
	BridgeError,
	type BridgeResult,
	type BridgeStatus,
	EXTENSION_VERSION_HEADER,
	type ForwardRequest,
	type ForwardResponse,
	HOST_VERSION_HEADER,
	isErrorClass,
	type NextResponse,
} from "../protocol/index.ts";
import type { CommandQueue, Waiter } from "./queue.ts";

/** 交命令时预留给扩展回传结果的时间：命令自己的时限先到，调用方才能拿到具体原因而不是桥的超时文案。 */
const RESULT_GRACE_MS = 500;

/** 端点要用到的门面能力。 */
export interface BridgeHost {
	/** 桥的地址，用来解析请求 URL。 */
	url(): string;
	/** 桥自己的状态，`/status` 直接回它。 */
	status(): BridgeStatus;
	/** `/next` 的挂起时长。 */
	holdMs: number;
	/** 宿主版本，每次轮询的应答都报给扩展。 */
	hostVersion: string;
	/** 扩展刚轮询了一次：记时间，记版本。 */
	onPoll(reportedVersion: string | undefined): void;
	/** 版本对不上时不发命令。 */
	versionMismatch(): boolean;
	/** 跑一条本地命令。`/command` 转发用。 */
	sendLocal(
		action: ActionName,
		params: Record<string, unknown> | undefined,
		options: { timeoutMs?: number },
	): Promise<unknown>;
	/** 在途命令表。`/next` 与 `/result` 用它取放命令。 */
	commands: CommandQueue;
}

export function createHandler(
	host: BridgeHost,
): (request: IncomingMessage, response: ServerResponse) => void {
	return (request, response) => {
		void route(host, request, response).catch((error: Error) => {
			sendJson(response, 500, { ok: false, error: error.message });
		});
	};
}

async function route(
	host: BridgeHost,
	request: IncomingMessage,
	response: ServerResponse,
): Promise<void> {
	const url = new URL(request.url ?? "/", host.url());
	if (request.method === "GET" && url.pathname === "/status") {
		sendJson(response, 200, host.status());
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
		await handleNext(host, request, response);
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
		await handleResult(host, request, response);
		return;
	}
	if (request.method === "POST" && url.pathname === "/command") {
		await handleCommand(host, request, response);
		return;
	}
	sendJson(response, 404, { ok: false, error: "not found" });
}

/** 另一个 Pi 进程转发来的命令：本进程当 owner 代跑，结果按原样回。 */
async function handleCommand(
	host: BridgeHost,
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
		const result = await host.sendLocal(body.action, body.params, {
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

async function handleNext(
	host: BridgeHost,
	request: IncomingMessage,
	response: ServerResponse,
): Promise<void> {
	const reported = request.headers[EXTENSION_VERSION_HEADER];
	host.onPoll(
		typeof reported === "string" && reported !== "" ? reported : undefined,
	);
	// 每次应答都报期望版本：扩展比自己旧就重载自己，用户不必去扩展页手动刷新。
	response.setHeader(HOST_VERSION_HEADER, host.hostVersion);
	if (host.versionMismatch()) {
		// 版本对不上就不发命令：先入队的也留着，等扩展换成同一版本再来取。
		sendJson(response, 200, { type: "none" } satisfies NextResponse);
		return;
	}
	let closed = false;
	let active: Waiter | undefined;
	const onClose = () => {
		closed = true;
		if (active === undefined) return;
		host.commands.drop(active);
	};
	request.once("close", onClose);

	const entry = await host.commands.take(
		host.holdMs,
		(waiter) => (active = waiter),
	);

	request.off("close", onClose);
	if (closed) {
		// 长轮询在投递前断线：把取走的命令放回队首，别丢。
		if (entry !== undefined) host.commands.restore(entry);
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

async function handleResult(
	host: BridgeHost,
	request: IncomingMessage,
	response: ServerResponse,
): Promise<void> {
	const result = JSON.parse(await readBody(request)) as BridgeResult;
	const entry = host.commands.claim(result.id);
	if (entry === undefined) {
		sendJson(response, 404, { ok: false, error: "unknown command id" });
		return;
	}
	// claim 已经摘掉这条命令（清定时器、卸 abort 监听），这里只需 settle。
	if (result.ok) entry.resolve(result.result);
	else entry.reject(bridgeErrorFrom(result.error));
	sendJson(response, 200, { ok: true });
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

/**
 * 把应答里的失败折成 {@link BridgeError}。
 * 类别由扩展给出，认不出就归 `page_error`：宁可少分类，也不让一句没有 hint 的错落到模型手里。
 * 旧版扩展还回字符串（升级时版本号没变），原样抛出，让 `tools/errors` 的前缀解析照旧生效。
 */
export function bridgeErrorFrom(error: unknown): Error {
	if (typeof error === "string") return new Error(error);
	if (typeof error === "object" && error !== null) {
		const { class: errorClass, message } = error as {
			class?: unknown;
			message?: unknown;
		};
		if (typeof message === "string" && message !== "")
			return new BridgeError(
				isErrorClass(errorClass) ? errorClass : "page_error",
				message,
			);
	}
	return new BridgeError(
		"page_error",
		"the extension reported a failure without a message",
	);
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

async function readBody(request: IncomingMessage): Promise<string> {
	const chunks: Buffer[] = [];
	for await (const chunk of request) chunks.push(chunk as Buffer);
	return Buffer.concat(chunks).toString("utf-8");
}
