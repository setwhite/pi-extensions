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

/** `/next` 的默认挂起时长。 */
export const DEFAULT_HOLD_MS = 25_000;

/** 最近一次轮询落在此窗口内算「已连接」。MV3 的 service worker 会暂停。 */
export const CONNECTED_WINDOW_MS = 5 * 60_000;
