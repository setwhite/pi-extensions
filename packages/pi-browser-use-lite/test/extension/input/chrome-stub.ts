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
		getTargets: Mock;
		sendCommand: Mock;
		onEvent: { addListener: Mock; removeListener: Mock };
		onDetach: { addListener: Mock; removeListener: Mock };
	};
	tabs: {
		get: Mock;
		update: Mock;
		query: Mock;
		onRemoved: { addListener: Mock };
	};
	windows: { get: Mock; update: Mock };
	scripting: { executeScript: Mock };
	runtime: {
		getURL: Mock;
		getManifest: Mock;
		onInstalled: { addListener: Mock };
		onStartup: { addListener: Mock };
		/** 扩展重载自己，版本落后自愈用。 */
		reload: Mock;
	};
	alarms: { create: Mock; onAlarm: { addListener: Mock } };
	webNavigation: { onCommitted: { addListener: Mock } };
	storage: {
		session: { get: Mock; set: Mock; remove: Mock };
		local: { get: Mock; set: Mock; remove: Mock };
	};
	/** 向已注册的 onDetach 监听器报一次摘除。 */
	emitDetach: (source: { tabId?: number }, reason: string) => void;
	/** 向已注册的 tabs.onRemoved 监听器报一次关闭。 */
	emitTabRemoved: (tabId: number) => void;
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
	/** attach 按队列应答，队列里的 Error 会被抛出。给了就不看 attachError。 */
	attachResults?: unknown[];
	/** chrome.debugger.getTargets 报的残留 target，默认空。 */
	debuggerTargets?: Array<{ tabId?: number; attached?: boolean }>;
	/** 预先塞进 chrome.storage.session 的键值。 */
	storage?: Record<string, unknown>;
	/** `chrome.runtime.getManifest().version` 报的版本，默认 `0.0.0`。 */
	version?: string;
	/** 给了就让它成为 chrome.scripting.executeScript 抛出的错误。 */
	scriptingError?: Error;
	/** executeScript 的应答。不给就返回 `[{ result: 1 }]`。 */
	executeScript?: (spec: Record<string, unknown>) => unknown;
	/** `chrome.windows.get` 报的窗口状态，默认 `normal`。 */
	windowState?: string;
	/** `chrome.tabs.get` 报的目标标签是否活动，默认 `false`。 */
	tabActive?: boolean;
	/** 给了就让 `chrome.storage.session.set` 抛出这个错误。 */
	storageError?: Error;
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
		const queued = options.attachResults
			? shift(options.attachResults, undefined)
			: undefined;
		if (queued instanceof Error) throw queued;
		if (options.attachError) throw options.attachError;
		methods.push("attach");
	});
	const getTargets = vi.fn(async () => options.debuggerTargets ?? []);
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
	const detachListeners = new Set<
		(source: { tabId?: number }, reason: string) => void
	>();
	const onDetach = {
		addListener: vi.fn(
			(listener: (source: { tabId?: number }, reason: string) => void) => {
				detachListeners.add(listener);
			},
		),
		removeListener: vi.fn(
			(listener: (source: { tabId?: number }, reason: string) => void) => {
				detachListeners.delete(listener);
			},
		),
	};
	const emitDetach: ChromeStub["emitDetach"] = (source, reason) => {
		for (const listener of [...detachListeners]) listener(source, reason);
	};
	const debuggerStub = {
		attach,
		detach,
		getTargets,
		sendCommand,
		onEvent,
		onDetach,
	};
	const scripting = {
		executeScript: vi.fn(async (spec: Record<string, unknown>) => {
			if (options.scriptingError) throw options.scriptingError;
			if (options.executeScript) return options.executeScript(spec) as unknown;
			return [{ result: 1 }] as unknown;
		}),
	};
	const windows = {
		get: vi.fn(async (id: number) => ({
			id,
			state: options.windowState ?? "normal",
		})),
		update: vi.fn(async () => ({})),
	};
	const removedListeners = new Set<(tabId: number) => void>();
	const tabs = {
		get: vi.fn(async (id: number) => ({
			id,
			windowId: 1,
			active: options.tabActive ?? false,
		})),
		update: vi.fn(async (id: number) => ({ id, windowId: 1, active: true })),
		query: vi.fn(async () => [] as Record<string, unknown>[]),
		onRemoved: {
			addListener: vi.fn((listener: (tabId: number) => void) => {
				removedListeners.add(listener);
			}),
		},
	};
	const runtime = {
		getURL: vi.fn((path: string) => `chrome-extension://test/${path}`),
		getManifest: vi.fn(() => ({ version: options.version ?? "0.0.0" })),
		onInstalled: { addListener: vi.fn() },
		onStartup: { addListener: vi.fn() },
		reload: vi.fn(),
	};
	const alarms = { create: vi.fn(), onAlarm: { addListener: vi.fn() } };
	const webNavigation = { onCommitted: { addListener: vi.fn() } };
	const session = new Map<string, unknown>(
		Object.entries(options.storage ?? {}),
	);
	const local = new Map<string, unknown>();
	const area = (store: Map<string, unknown>) => ({
		get: vi.fn(async (key: string | string[] | null) => {
			if (key === null) return Object.fromEntries(store);
			const keys = Array.isArray(key) ? key : [key];
			const found: Record<string, unknown> = {};
			for (const name of keys)
				if (store.has(name)) found[name] = store.get(name);
			return found;
		}),
		set: vi.fn(async (values: Record<string, unknown>) => {
			if (store === session && options.storageError !== undefined)
				throw options.storageError;
			for (const [name, value] of Object.entries(values))
				store.set(name, value);
		}),
		remove: vi.fn(async (key: string | string[]) => {
			for (const name of Array.isArray(key) ? key : [key]) store.delete(name);
		}),
	});
	const storage = { session: area(session), local: area(local) };
	(globalThis as { chrome?: unknown }).chrome = {
		debugger: options.withDebugger === false ? undefined : debuggerStub,
		scripting,
		storage,
		tabs,
		windows,
		runtime,
		alarms,
		webNavigation,
	};
	return {
		calls,
		methods,
		debugger: debuggerStub,
		tabs,
		emitTabRemoved: (tabId: number) => {
			for (const listener of [...removedListeners]) listener(tabId);
		},
		windows,
		scripting,
		runtime,
		alarms,
		webNavigation,
		storage,
		emit,
		emitDetach,
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
