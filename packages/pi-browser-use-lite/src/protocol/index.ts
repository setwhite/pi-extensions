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
	"tab.group",
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
}

/** 一次应答：Chrome 扩展回传。`ok` 为 false 时看 `error`。 */
export interface BridgeResult {
	id: string;
	ok: boolean;
	result?: unknown;
	error?: string;
}

/** `GET /next` 的响应。一次只给一条命令，没有就给 `none`。 */
export type NextResponse =
	| { type: "command"; command: BridgeCommand }
	| { type: "none" };

/** 桥的 lifecycle 状态。`stopped` 之后 `send()` 一律被拒。 */
export type BridgeMode = "starting" | "server" | "stopped";

/** `GET /status` 的响应。 */
export interface BridgeStatus {
	mode: BridgeMode;
	url: string;
	connected: boolean;
	lastSeenAt?: number;
	queuedCommands: number;
	pendingCommands: number;
}

/** 桥自己会发出的错误类别，取自 SPEC-0001 错误表。 */
export type BridgeErrorClass =
	| "bridge_unreachable"
	| "timeout"
	| "page_error"
	| "aborted";

/** 每类错误的下一步动作，取自 SPEC-0001 错误表。`aborted` 没有下一步，所以是空串。 */
const HINTS: Record<BridgeErrorClass, string> = {
	bridge_unreachable: "Run /chrome status, or change bridge.port",
	timeout: "Run /chrome status",
	page_error:
		"read the first line of the error, then retry or fix the arguments",
	aborted: "",
};

/** 一条命令的失败。`details.error` 与工具结果信封里的同名字段形状一致。 */
export class BridgeError extends Error {
	readonly details: {
		error: { class: BridgeErrorClass; message: string; hint: string };
	};

	constructor(errorClass: BridgeErrorClass, message: string) {
		super(message);
		this.name = "BridgeError";
		this.details = {
			error: { class: errorClass, message, hint: HINTS[errorClass] },
		};
	}
}

/** `/next` 的默认挂起时长。 */
export const DEFAULT_HOLD_MS = 25_000;

/** 一条命令的默认超时。SPEC-0001 非功能：单次工具调用超时 30 秒。 */
export const DEFAULT_COMMAND_TIMEOUT_MS = 30_000;

/** 最近一次轮询落在此窗口内算「已连接」。MV3 的 service worker 会暂停。 */
export const CONNECTED_WINDOW_MS = 5 * 60_000;
