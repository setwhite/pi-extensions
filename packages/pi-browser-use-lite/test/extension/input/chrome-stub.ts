import { vi } from "vitest";

export type Mock = ReturnType<typeof vi.fn>;

export interface CdpCall {
	method: string;
	params: Record<string, unknown>;
}

export interface ChromeStub {
	/** 每条 CDP 调用的方法名与参数。 */
	calls: CdpCall[];
	/** 按顺序记下的 attach、detach、send。 */
	methods: string[];
	/** 桩对象。chrome.debugger 不可用时也返回，便于断言没被调用。 */
	debugger: { attach: Mock; detach: Mock; sendCommand: Mock };
	tabs: { update: Mock };
	scripting: { executeScript: Mock };
}

export interface StubOptions {
	/** 传 false 时不挂 chrome.debugger。 */
	withDebugger?: boolean;
	/** Runtime.evaluate 的应答值。 */
	evaluate?: (expression: string) => unknown;
	/** sendCommand 按队列应答，队列里的 Error 会被抛出。给了就不走 evaluate。 */
	sendResults?: unknown[];
	/** detach 按队列应答，队列里的 Error 会被抛出。 */
	detachResults?: unknown[];
}

/** 扩展侧的 JS 没有类型声明，用文件 URL 动态载入。 */
export function extensionUrl(path: string): string {
	return new URL(
		`../../../browser-extension/background/${path}`,
		import.meta.url,
	).href;
}

/** 挂 chrome 桩。记录每次调用，按 options 应答。 */
export function stubChrome(options: StubOptions = {}): ChromeStub {
	const calls: CdpCall[] = [];
	const methods: string[] = [];
	const sendCommand = vi.fn(
		async (
			_target: unknown,
			method: string,
			params: Record<string, unknown> = {},
		) => {
			methods.push("send");
			calls.push({ method, params });
			if (options.sendResults) return shift(options.sendResults, "ok");
			if (method !== "Runtime.evaluate") return {};
			return {
				result: { value: options.evaluate?.(String(params.expression)) },
			};
		},
	);
	const attach = vi.fn(async () => {
		methods.push("attach");
	});
	const detach = vi.fn(async () => {
		methods.push("detach");
		if (options.detachResults) shift(options.detachResults, undefined);
	});
	const debuggerStub = { attach, detach, sendCommand };
	const scripting = {
		executeScript: vi.fn(async () => [{ result: 1 }] as unknown),
	};
	const tabs = { update: vi.fn(async () => ({})) };
	(globalThis as { chrome?: unknown }).chrome = {
		debugger: options.withDebugger === false ? undefined : debuggerStub,
		scripting,
		tabs,
	};
	return { calls, methods, debugger: debuggerStub, tabs, scripting };
}

/** 卸掉 chrome 桩。 */
export function uninstallChrome(): void {
	delete (globalThis as { chrome?: unknown }).chrome;
}

function shift(queue: unknown[], fallback: unknown): unknown {
	const value = queue.shift();
	if (value instanceof Error) throw value;
	return value ?? fallback;
}
