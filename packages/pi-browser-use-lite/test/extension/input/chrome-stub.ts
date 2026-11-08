import { vi } from "vitest";

export type Mock = ReturnType<typeof vi.fn>;

export interface CdpCall {
	method: string;
	params: Record<string, unknown>;
}

export type DebuggerEvent = (
	source: { tabId?: number; targetId?: string },
	method: string,
	params: Record<string, unknown>,
) => void;

export interface ChromeStub {
	/** 每条 CDP 调用的方法名与参数。 */
	calls: CdpCall[];
	/** 按顺序记下的 attach、detach、send。 */
	methods: string[];
	/** 桩对象。chrome.debugger 不可用时也返回，便于断言没被调用。 */
	debugger: {
		attach: Mock;
		detach: Mock;
		sendCommand: Mock;
		onEvent: { addListener: Mock; removeListener: Mock };
	};
	tabs: { update: Mock };
	scripting: { executeScript: Mock };
	runtime: { getURL: Mock };
	/** 向已注册的 onEvent 监听器发一条调试器事件。 */
	emit: (
		source: { tabId?: number; targetId?: string },
		method: string,
		params?: Record<string, unknown>,
	) => void;
}

export interface StubOptions {
	/** 传 false 时不挂 chrome.debugger。 */
	withDebugger?: boolean;
	/** 每条 sendCommand 按 method 与 params 应答；给了就不看 sendResults 与 evaluate。 */
	send?: (method: string, params: Record<string, unknown>) => unknown;
	/** Runtime.evaluate 的应答值。 */
	evaluate?: (expression: string) => unknown;
	/** sendCommand 按队列应答，队列里的 Error 会被抛出。给了就不走 evaluate。 */
	sendResults?: unknown[];
	/** detach 按队列应答，队列里的 Error 会被抛出。 */
	detachResults?: unknown[];
	/** 给了就让它成为 chrome.debugger.attach 抛出的错误。 */
	attachError?: Error;
	/** 给了就让它成为 chrome.scripting.executeScript 抛出的错误。 */
	scriptingError?: Error;
	/** executeScript 的应答。不给就返回 `[{ result: 1 }]`。 */
	executeScript?: (spec: Record<string, unknown>) => unknown;
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
			if (options.send) return await options.send(method, params);
			if (options.sendResults) return shift(options.sendResults, "ok");
			if (method !== "Runtime.evaluate") return {};
			return {
				result: { value: await options.evaluate?.(String(params.expression)) },
			};
		},
	);
	const attach = vi.fn(async () => {
		if (options.attachError) throw options.attachError;
		methods.push("attach");
	});
	const detach = vi.fn(async () => {
		methods.push("detach");
		if (options.detachResults) shift(options.detachResults, undefined);
	});
	const listeners = new Set<DebuggerEvent>();
	const onEvent = {
		addListener: vi.fn((listener: DebuggerEvent) => {
			listeners.add(listener);
		}),
		removeListener: vi.fn((listener: DebuggerEvent) => {
			listeners.delete(listener);
		}),
	};
	const emit: ChromeStub["emit"] = (source, method, params = {}) => {
		for (const listener of [...listeners]) listener(source, method, params);
	};
	const debuggerStub = { attach, detach, sendCommand, onEvent };
	const scripting = {
		executeScript: vi.fn(async (spec: Record<string, unknown>) => {
			if (options.scriptingError) throw options.scriptingError;
			if (options.executeScript) return options.executeScript(spec) as unknown;
			return [{ result: 1 }] as unknown;
		}),
	};
	const tabs = { update: vi.fn(async () => ({})) };
	const runtime = {
		getURL: vi.fn((path: string) => `chrome-extension://test/${path}`),
	};
	const session = new Map<string, unknown>();
	const storage = {
		session: {
			get: vi.fn(async (key: string) => {
				const value = session.get(key);
				return value === undefined ? {} : { [key]: value };
			}),
			set: vi.fn(async (values: Record<string, unknown>) => {
				for (const [key, value] of Object.entries(values))
					session.set(key, value);
			}),
		},
	};
	(globalThis as { chrome?: unknown }).chrome = {
		debugger: options.withDebugger === false ? undefined : debuggerStub,
		scripting,
		storage,
		tabs,
		runtime,
	};
	return {
		calls,
		methods,
		debugger: debuggerStub,
		tabs,
		scripting,
		runtime,
		emit,
	};
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
