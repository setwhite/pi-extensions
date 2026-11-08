import { afterEach, expect, it, vi } from "vitest";
import { stubTabsChrome, type Tab } from "./tabs-stub.ts";

interface TabsModule {
	listTabs: (params: { sessionKey: string }) => Promise<Tab[]>;
	newTab: (params: {
		sessionKey: string;
		url?: string;
		groupName?: string;
		groupColor?: string;
		background?: boolean;
	}) => Promise<Tab>;
	activateTab: (params: {
		tabId: number;
		background?: boolean;
	}) => Promise<Tab>;
	pendingTabCreations: Set<Promise<unknown>>;
	navigateTab: (params: {
		tabId: number;
		url: string;
		initScript?: string;
		timeoutMs?: number;
	}) => Promise<Tab>;
	closeTab: (params: { tabId: number }) => Promise<{ closed: number }>;
	groupTab: (params: {
		sessionKey: string;
		tabId: number;
		groupName?: string;
		groupColor?: string;
	}) => Promise<Tab>;
}

/** 扩展侧的 JS 没有类型声明，用文件 URL 动态载入。 */
function extensionUrl(path: string): string {
	return new URL(`../../browser-extension/background/${path}`, import.meta.url)
		.href;
}

const {
	listTabs,
	newTab,
	activateTab,
	pendingTabCreations,
	navigateTab,
	closeTab,
	groupTab,
} = (await import(extensionUrl("tabs.js"))) as TabsModule;

afterEach(() => {
	delete (globalThis as { chrome?: unknown }).chrome;
});

it("AC3: tab.list 只返回本会话组里的标签", async () => {
	const stub = stubTabsChrome({ groupId: 7 });
	stub.tabs.query.mockResolvedValueOnce([
		{ id: 3, active: true, groupId: 7, title: "a", url: "https://a/" },
		{ id: 4, active: false, groupId: 7, title: "b", url: "https://b/" },
	]);

	const tabs = await listTabs({ sessionKey: "s1" });

	expect(stub.tabs.query).toHaveBeenCalledWith({ groupId: 7 });
	expect(tabs).toEqual([
		{ id: 3, active: true, groupId: 7, title: "a", url: "https://a/" },
		{ id: 4, active: false, groupId: 7, title: "b", url: "https://b/" },
	]);
});

it("AC3: 还没有会话组时 tab.list 返回空", async () => {
	const stub = stubTabsChrome();

	const tabs = await listTabs({ sessionKey: "s1" });

	expect(tabs).toEqual([]);
	expect(stub.tabs.query).not.toHaveBeenCalled();
});

it("AC6: 被拖出本会话组的标签不再列出", async () => {
	const stub = stubTabsChrome({ groupId: 7 });
	stub.tabs.query.mockResolvedValueOnce([
		{ id: 4, active: false, groupId: 7, title: "b", url: "https://b/" },
	]);

	const tabs = await listTabs({ sessionKey: "s1" });

	expect(tabs.map((tab) => tab.id)).toEqual([4]);
});

it("AC2/AC8: tab.new 建标签、入组并把标题与颜色交给 tabGroups.update", async () => {
	const stub = stubTabsChrome();
	stub.tabs.create.mockResolvedValueOnce({
		id: 21,
		active: false,
		groupId: -1,
		windowId: 9,
		title: "",
		url: "",
	} as Tab);
	stub.tabs.group.mockResolvedValueOnce(7);
	stub.tabs.get.mockResolvedValueOnce({
		id: 21,
		active: false,
		groupId: 7,
		title: "a",
		url: "https://a/",
	} as Tab);

	const tab = await newTab({
		sessionKey: "s1",
		url: "https://a/",
		groupName: "Pi",
		groupColor: "blue",
		background: true,
	});

	expect(stub.tabs.create).toHaveBeenCalledWith({
		url: "https://a/",
		active: false,
	});
	expect(stub.tabs.group).toHaveBeenCalledWith({
		tabIds: [21],
		createProperties: { windowId: 9 },
	});
	expect(stub.tabGroups.update).toHaveBeenCalledWith(7, {
		title: "Pi",
		color: "blue",
	});
	expect(stub.store["tabs.groupId.s1"]).toBe(7);
	expect(tab).toEqual({
		id: 21,
		active: false,
		groupId: 7,
		title: "a",
		url: "https://a/",
	});
});

it("AC2: 已有会话组时新标签加入同一个组", async () => {
	const stub = stubTabsChrome({ groupId: 7 });
	stub.tabs.create.mockResolvedValueOnce({ id: 22, active: true } as Tab);
	stub.tabs.group.mockResolvedValueOnce(7);
	stub.tabs.get.mockResolvedValueOnce({
		id: 22,
		active: true,
		groupId: 7,
		title: "b",
		url: "https://b/",
	} as Tab);

	await newTab({
		sessionKey: "s1",
		url: "https://b/",
		groupName: "Pi",
		groupColor: "blue",
	});

	expect(stub.tabs.group).toHaveBeenCalledWith({ groupId: 7, tabIds: [22] });
});

it("AC2: 分组失败时关闭新标签并抛错", async () => {
	const stub = stubTabsChrome();
	stub.tabs.create.mockResolvedValueOnce({ id: 23, active: true } as Tab);
	stub.tabs.group.mockRejectedValueOnce(new Error("group failed"));

	await expect(
		newTab({
			sessionKey: "s1",
			url: "https://c/",
			groupName: "Pi",
			groupColor: "blue",
		}),
	).rejects.toThrow("group failed");

	expect(stub.tabs.remove).toHaveBeenCalledWith(23);
});

it("质量: 两个 sessionKey 各用各的组", async () => {
	const stub = stubTabsChrome();
	stub.tabs.create
		.mockResolvedValueOnce({ id: 41, active: true, windowId: 9 } as Tab)
		.mockResolvedValueOnce({ id: 42, active: true, windowId: 9 } as Tab);
	stub.tabs.group.mockResolvedValueOnce(7).mockResolvedValueOnce(8);
	stub.tabs.get
		.mockResolvedValueOnce({ id: 41, groupId: 7 } as Tab)
		.mockResolvedValueOnce({ id: 42, groupId: 8 } as Tab);

	await newTab({
		sessionKey: "s1",
		url: "https://a/",
		groupName: "Pi",
		groupColor: "blue",
	});
	await newTab({
		sessionKey: "s2",
		url: "https://b/",
		groupName: "Pi",
		groupColor: "blue",
	});

	expect(stub.tabs.group).toHaveBeenNthCalledWith(1, {
		tabIds: [41],
		createProperties: { windowId: 9 },
	});
	expect(stub.tabs.group).toHaveBeenNthCalledWith(2, {
		tabIds: [42],
		createProperties: { windowId: 9 },
	});
	expect(stub.store["tabs.groupId.s1"]).toBe(7);
	expect(stub.store["tabs.groupId.s2"]).toBe(8);
});

it("AC4: 后台模式 tab.activate 抛错且不调用 tabs.update", async () => {
	const stub = stubTabsChrome();

	await expect(activateTab({ tabId: 5, background: true })).rejects.toThrow(
		"background mode",
	);

	expect(stub.tabs.update).not.toHaveBeenCalled();
});

it("AC4: 前台模式激活标签", async () => {
	const stub = stubTabsChrome();
	stub.tabs.update.mockResolvedValueOnce({
		id: 5,
		active: true,
		groupId: -1,
		title: "a",
		url: "https://a/",
	} as Tab);

	const tab = await activateTab({ tabId: 5, background: false });

	expect(stub.tabs.update).toHaveBeenCalledWith(5, { active: true });
	expect(tab.id).toBe(5);
});

it("AC5: 早期捕获在 pendingTabCreations 上等，不报 tab not found", async () => {
	const stub = stubTabsChrome();
	let release!: (tab: Tab) => void;
	stub.tabs.create.mockReturnValueOnce(
		new Promise<Tab>((resolve) => {
			release = resolve;
		}),
	);
	stub.tabs.group.mockResolvedValueOnce(7);
	stub.tabs.get.mockResolvedValueOnce({
		id: 21,
		active: false,
		groupId: 7,
		title: "",
		url: "https://a/",
	} as Tab);

	const creating = newTab({
		sessionKey: "s1",
		url: "https://a/",
		groupName: "Pi",
		groupColor: "blue",
	});
	expect(pendingTabCreations.size).toBe(1);

	let waited = false;
	const waiter = Promise.allSettled([...pendingTabCreations]).then(() => {
		waited = true;
	});
	await Promise.resolve();
	expect(waited).toBe(false);

	release({ id: 21 } as Tab);
	await creating;
	await waiter;

	expect(waited).toBe(true);
	expect(pendingTabCreations.size).toBe(0);
});

it("AC7: navigate 带 initScript 时在导航前注册、完成后移除", async () => {
	const stub = stubTabsChrome();
	const order: string[] = [];
	stub.debugger.sendCommand.mockImplementation(
		async (_target: unknown, method: string) => {
			order.push(method);
			return method === "Page.addScriptToEvaluateOnNewDocument"
				? { identifier: "s1" }
				: {};
		},
	);
	stub.tabs.update.mockImplementation(async () => {
		order.push("update");
		return { id: 5 } as Tab;
	});
	stub.tabs.get.mockResolvedValue({
		id: 5,
		active: false,
		groupId: 7,
		title: "a",
		url: "https://a/",
	} as Tab);

	const first = navigateTab({
		tabId: 5,
		url: "https://a/",
		initScript: "window.x = 1",
		timeoutMs: 15_000,
	});
	await vi.waitFor(() => expect(stub.tabs.update).toHaveBeenCalledTimes(1));
	expect(stub.debugger.sendCommand).toHaveBeenCalledWith(
		{ tabId: 5 },
		"Page.addScriptToEvaluateOnNewDocument",
		{ source: "window.x = 1" },
	);
	for (const listener of stub.listeners) listener(5, { status: "complete" });
	await first;

	expect(order).toEqual([
		"Page.addScriptToEvaluateOnNewDocument",
		"update",
		"Page.removeScriptToEvaluateOnNewDocument",
	]);
	expect(stub.debugger.sendCommand).toHaveBeenCalledWith(
		{ tabId: 5 },
		"Page.removeScriptToEvaluateOnNewDocument",
		{ identifier: "s1" },
	);

	const second = navigateTab({
		tabId: 5,
		url: "https://b/",
		timeoutMs: 15_000,
	});
	await vi.waitFor(() => expect(stub.tabs.update).toHaveBeenCalledTimes(2));
	for (const listener of stub.listeners) listener(5, { status: "complete" });
	await second;

	expect(
		stub.debugger.sendCommand.mock.calls.filter(
			([, method]) => method === "Page.addScriptToEvaluateOnNewDocument",
		),
	).toHaveLength(1);
});

it("AC9: 页面在超时后仍加载不完时报 timeout", async () => {
	vi.useFakeTimers();
	try {
		const stub = stubTabsChrome();
		stub.tabs.update.mockResolvedValue({ id: 9 } as Tab);

		const navigating = navigateTab({
			tabId: 9,
			url: "https://slow/",
			timeoutMs: 100,
		});
		const assertion = expect(navigating).rejects.toThrow("timeout");
		await vi.advanceTimersByTimeAsync(100);
		await assertion;

		expect(stub.tabs.onUpdated.removeListener).toHaveBeenCalled();
	} finally {
		vi.useRealTimers();
	}
});

it("质量: tabs.update 抛错后不留下未处理的超时 rejection", async () => {
	vi.useFakeTimers();
	try {
		const stub = stubTabsChrome();
		stub.tabs.update.mockRejectedValueOnce(new Error("Invalid URL"));

		await expect(
			navigateTab({ tabId: 9, url: "bad://x", timeoutMs: 40 }),
		).rejects.toThrow("Invalid URL");

		expect(vi.getTimerCount()).toBe(0);
		expect(stub.tabs.onUpdated.removeListener).toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(50);
	} finally {
		vi.useRealTimers();
	}
});

it("质量: 缺 sessionKey 或配置参数时抛明确错误", async () => {
	const stub = stubTabsChrome();

	await expect(listTabs({} as { sessionKey: string })).rejects.toThrow(
		"sessionKey is required",
	);
	await expect(newTab({ sessionKey: "s1", url: "https://a/" })).rejects.toThrow(
		"groupName and groupColor are required",
	);
	await expect(navigateTab({ tabId: 1, url: "https://a/" })).rejects.toThrow(
		"timeoutMs is required",
	);

	expect(stub.tabs.create).not.toHaveBeenCalled();
	expect(stub.tabs.update).not.toHaveBeenCalled();
	expect(stub.tabs.onUpdated.addListener).not.toHaveBeenCalled();
});

it("交付物: tab.close 关闭标签", async () => {
	const stub = stubTabsChrome();

	const result = await closeTab({ tabId: 31 });

	expect(stub.tabs.remove).toHaveBeenCalledWith(31);
	expect(result).toEqual({ closed: 31 });
});

it("交付物: tab.group 把已有标签加进会话组", async () => {
	const stub = stubTabsChrome({ groupId: 7 });
	stub.tabs.group.mockResolvedValueOnce(7);
	stub.tabs.get.mockResolvedValue({
		id: 32,
		active: false,
		groupId: 7,
		windowId: 9,
		title: "c",
		url: "https://c/",
	} as Tab);

	const tab = await groupTab({
		sessionKey: "s1",
		tabId: 32,
		groupName: "Pi",
		groupColor: "red",
	});

	expect(stub.tabs.group).toHaveBeenCalledWith({ groupId: 7, tabIds: [32] });
	expect(stub.tabGroups.update).toHaveBeenCalledWith(7, {
		title: "Pi",
		color: "red",
	});
	expect(tab.groupId).toBe(7);
});
