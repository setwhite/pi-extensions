/**
 * 桥协议：命令与结果信封、动作名表、超时常量。
 * 动作名照 pi-chrome（DEC-0010），去掉 DEC-0007 砍掉的那些。
 */

/** 动作名。命令里的 `action` 取值，唯一来源。 */
export const ACTION_NAMES = [
	"tab.version",
	"tab.list",
	"tab.new",
	"tab.activate",
	"tab.close",
	"page.navigate",
	"page.snapshot",
	"page.inspect",
	"page.evaluate",
	"page.click",
	"page.hover",
	"page.drag",
	"page.upload",
	"page.type",
	"page.fill",
	"page.key",
	"page.scroll",
	"page.waitFor",
	"page.screenshot",
	"page.console.list",
	"page.network.list",
	"page.network.get",
	"cdp.call",
	"automation.cleanup",
] as const;

export type ActionName = (typeof ACTION_NAMES)[number];

/** 一条命令：Pi 侧发出，Chrome 扩展取走。 */
export interface BridgeCommand {
	id: string;
	action: ActionName;
	params?: Record<string, unknown>;
	/**
	 * 扩展还愿意在这条命令上花多久，毫秒。桥在交命令的那一刻按剩余预算算好，已扣掉回传结果的时间。
	 * 扩展到期就放弃这条命令并回 `timeout:`，不让一条卡住的命令钉死整个轮询。
	 */
	remainingMs: number;
}

/** 一次应答：Chrome 扩展回传。`ok` 为 false 时看 `error`。 */
export interface BridgeResult {
	id: string;
	ok: boolean;
	result?: unknown;
	/** 失败的类别与原因。类别认不出时桥归 `page_error`，原因原样保留。 */
	error?: { class: ErrorClass; message: string };
}

/** `POST /command` 的请求体：另一个 Pi 进程把命令转给 owner。 */
export interface ForwardRequest {
	action: ActionName;
	params?: Record<string, unknown>;
	timeoutMs?: number;
}

/** `POST /command` 的响应。失败带类别与消息，转发方据此还原 {@link BridgeError}。 */
export type ForwardResponse =
	| { ok: true; result: unknown }
	| { ok: false; error: { class: ErrorClass; message: string } };

/** `GET /next` 的响应。一次只给一条命令，没有就给 `none`。 */
export type NextResponse =
	| { type: "command"; command: BridgeCommand }
	| { type: "none" };

/**
 * 桥的 lifecycle 状态。`stopped` 之后 `send()` 一律被拒。
 * `client` 表示端口已被另一个 Pi 进程的桥占着，命令转发给它执行。
 */
export type BridgeMode = "starting" | "server" | "client" | "stopped";

/** `GET /status` 的响应。 */
export interface BridgeStatus {
	mode: BridgeMode;
	url: string;
	connected: boolean;
	lastSeenAt?: number;
	queuedCommands: number;
	pendingCommands: number;
	/** 扩展握手时报回的版本。还没握手时不带。 */
	extensionVersion?: string;
}

/** SPEC-0001 错误表的 12 个类别。命令与结果跨桥时只认这一份。 */
export const ERROR_CLASSES = [
	"locked",
	"bridge_unreachable",
	"extension_missing",
	"extension_version",
	"no_target",
	"tab_not_found",
	"tab_ambiguous",
	"bad_args",
	"timeout",
	"cdp_unavailable",
	"page_error",
	"aborted",
] as const;

export type ErrorClass = (typeof ERROR_CLASSES)[number];

/** 每类的下一步动作，取自 SPEC-0001 错误表。 */
export const ERROR_HINTS: Record<ErrorClass, string> = {
	locked: "Run /chrome authorize on",
	bridge_unreachable: "Run /chrome status, or change bridge.port",
	extension_missing: "load the unpacked extension, then run /chrome status",
	extension_version:
		"wait a second; if it keeps failing, the extension on disk is old",
	no_target: "run chrome_act navigate or chrome_tab new first",
	tab_not_found: "run chrome_tab list",
	tab_ambiguous: "pass a longer match or a tab id",
	bad_args: "fix the arguments and retry",
	timeout: "Run /chrome status",
	cdp_unavailable: "close DevTools or the other debugger on that tab",
	page_error: "fix the cause, then retry",
	aborted: "retry if you still need it",
};

const ERROR_CLASS_SET: ReadonlySet<string> = new Set(ERROR_CLASSES);

/** 认一个值是不是错误类别。查 Set：原型链上的名字不算。 */
export function isErrorClass(value: unknown): value is ErrorClass {
	return typeof value === "string" && ERROR_CLASS_SET.has(value);
}

/** 一条命令的失败。`details.error` 与工具结果信封里的同名字段形状一致。 */
export class BridgeError extends Error {
	readonly details: {
		error: { class: ErrorClass; message: string; hint: string };
	};

	constructor(errorClass: ErrorClass, message: string) {
		super(message);
		this.name = "BridgeError";
		this.details = {
			error: { class: errorClass, message, hint: ERROR_HINTS[errorClass] },
		};
	}
}

/** 扩展在每次请求上报自身版本的请求头。扩展侧的同名常量在 transport.js。 */
export const EXTENSION_VERSION_HEADER = "x-pi-browser-use-version";

/** 桥在 `/next` 应答里报期望版本的响应头，扩展据此决定要不要重载自己。扩展侧的同名常量在 transport.js。 */
export const HOST_VERSION_HEADER = "x-pi-browser-use-host-version";

/** `/next` 的默认挂起时长。 */
export const DEFAULT_HOLD_MS = 25_000;

/** 一条命令的默认超时。SPEC-0001 非功能：单次工具调用超时 30 秒。 */
export const DEFAULT_COMMAND_TIMEOUT_MS = 30_000;

/** 新桥给扩展第一次轮询的宽限。扩展的轮询循环每秒重起，2 秒足够跨过首次。 */
export const FIRST_POLL_GRACE_MS = 2_000;

/** 最近一次轮询落在此窗口内算「已连接」。MV3 的 service worker 会暂停。 */
export const CONNECTED_WINDOW_MS = 5 * 60_000;
