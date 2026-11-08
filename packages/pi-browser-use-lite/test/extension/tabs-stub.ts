import { vi } from "vitest";

export interface Tab {
	id: number;
	active?: boolean;
	windowId?: number;
	title?: string;
	url?: string;
}

export type Mock = ReturnType<typeof vi.fn>;

/** 标签页与 target 模块测试用的 `chrome` 桩：tabs、windows、storage、debugger 与 onUpdated 监听器。 */
export interface TabsChromeStub {
	/** `chrome.storage.session` 的内容。 */
	store: Record<string, unknown>;
	/** `chrome.storage.local` 的内容。 */
	localStore: Record<string, unknown>;
	tabs: {
		query: Mock;
		create: Mock;
		get: Mock;
		remove: Mock;
		update: Mock;
		onUpdated: { addListener: Mock; removeListener: Mock };
	};
	windows: { create: Mock; get: Mock; update: Mock };
	debugger: { attach: Mock; detach: Mock; sendCommand: Mock };
	listeners: Set<(tabId: number, changeInfo: { status?: string }) => void>;
}

/** 挂 `chrome` 桩。两处存储各用一个对象模拟，跨调用保留。 */
export function stubTabsChrome(
	options: { windowId?: number; sessionKey?: string } = {},
): TabsChromeStub {
	const store: Record<string, unknown> = {};
	const localStore: Record<string, unknown> = {};
	if (options.windowId !== undefined)
		store[`tabs.windowId.${options.sessionKey ?? "s1"}`] = options.windowId;
	const listeners = new Set<
		(tabId: number, changeInfo: { status?: string }) => void
	>();
	const tabs = {
		query: vi.fn(async () => [] as Tab[]),
		create: vi.fn(async () => ({}) as Tab),
		get: vi.fn(async () => ({}) as Tab),
		remove: vi.fn(async () => undefined),
		update: vi.fn(async () => ({}) as Tab),
		onUpdated: {
			addListener: vi.fn(
				(
					listener: (tabId: number, changeInfo: { status?: string }) => void,
				) => {
					listeners.add(listener);
				},
			),
			removeListener: vi.fn(
				(
					listener: (tabId: number, changeInfo: { status?: string }) => void,
				) => {
					listeners.delete(listener);
				},
			),
		},
	};
	const windows = {
		create: vi.fn(async () => ({ id: 9, tabs: [] as Tab[] })),
		get: vi.fn(async () => ({ id: options.windowId ?? 9 })),
		update: vi.fn(async () => ({ id: options.windowId ?? 9 })),
	};
	const debuggerStub = {
		attach: vi.fn(async () => undefined),
		detach: vi.fn(async () => undefined),
		sendCommand: vi.fn(async () => ({}) as Record<string, unknown>),
	};
	const storage = {
		session: {
			get: vi.fn(
				async (key: string) =>
					({ [key]: store[key] }) as Record<string, unknown>,
			),
			set: vi.fn(async (entries: Record<string, unknown>) => {
				Object.assign(store, entries);
			}),
			remove: vi.fn(async (keys: string | string[]) => {
				for (const key of Array.isArray(keys) ? keys : [keys])
					delete store[key];
			}),
		},
		local: {
			get: vi.fn(
				async (key: string) =>
					({ [key]: localStore[key] }) as Record<string, unknown>,
			),
			set: vi.fn(async (entries: Record<string, unknown>) => {
				Object.assign(localStore, entries);
			}),
			remove: vi.fn(async (keys: string | string[]) => {
				for (const key of Array.isArray(keys) ? keys : [keys])
					delete localStore[key];
			}),
		},
	};
	(globalThis as { chrome?: unknown }).chrome = {
		tabs,
		windows,
		storage,
		debugger: debuggerStub,
	};
	return {
		store,
		localStore,
		tabs,
		windows,
		debugger: debuggerStub,
		listeners,
	};
}
