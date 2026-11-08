import { vi } from "vitest";

export interface Tab {
	id: number;
	active?: boolean;
	groupId?: number;
	windowId?: number;
	title?: string;
	url?: string;
}

export type Mock = ReturnType<typeof vi.fn>;

/** 标签页模块测试用的 `chrome` 桩：tabs、tabGroups、storage、debugger 与 onUpdated 监听器。 */
export interface TabsChromeStub {
	/** `chrome.storage.session` 的内容。 */
	store: Record<string, unknown>;
	/** `chrome.storage.local` 的内容。 */
	localStore: Record<string, unknown>;
	tabs: {
		query: Mock;
		create: Mock;
		get: Mock;
		group: Mock;
		remove: Mock;
		update: Mock;
		onUpdated: { addListener: Mock; removeListener: Mock };
	};
	tabGroups: { query: Mock; update: Mock };
	debugger: { attach: Mock; detach: Mock; sendCommand: Mock };
	listeners: Set<(tabId: number, changeInfo: { status?: string }) => void>;
}

/** 挂 `chrome` 桩。两处存储各用一个对象模拟，跨调用保留。 */
export function stubTabsChrome(
	options: { groupId?: number; sessionKey?: string } = {},
): TabsChromeStub {
	const store: Record<string, unknown> = {};
	const localStore: Record<string, unknown> = {};
	if (options.groupId !== undefined)
		store[`tabs.groupId.${options.sessionKey ?? "s1"}`] = options.groupId;
	const listeners = new Set<
		(tabId: number, changeInfo: { status?: string }) => void
	>();
	const tabs = {
		query: vi.fn(async () => [] as Tab[]),
		create: vi.fn(async () => ({}) as Tab),
		get: vi.fn(async () => ({}) as Tab),
		group: vi.fn(async () => -1),
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
	const debuggerStub = {
		attach: vi.fn(async () => undefined),
		detach: vi.fn(async () => undefined),
		sendCommand: vi.fn(async () => ({}) as Record<string, unknown>),
	};
	const tabGroups = {
		query: vi.fn(async () => [{ id: 7 }]),
		update: vi.fn(async () => undefined),
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
		tabGroups,
		storage,
		debugger: debuggerStub,
	};
	return {
		store,
		localStore,
		tabs,
		tabGroups,
		debugger: debuggerStub,
		listeners,
	};
}
