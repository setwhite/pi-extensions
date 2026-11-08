import { afterEach, expect, it, vi } from "vitest";
import { stubTabsChrome, type Tab } from "./tabs-stub.ts";

interface TabsModule {
	listTabs: (params: { sessionKey: string }) => Promise<Tab[]>;
	newTab: (params: {
		sessionKey: string;
		url?: string;
		background?: boolean;
	}) => Promise<Tab>;
	activateTab: (params: {
		tabId: number;
		background?: boolean;
	}) => Promise<Tab>;
	navigateTab: (params: {
		tabId: number;
		url: string;
		initScript?: string;
		timeoutMs?: number;
	}) => Promise<Tab>;
	closeTab: (params: { tabId: number }) => Promise<{ closed: number }>;
	sessionWindowId: (sessionKey: string) => Promise<number | undefined>;
	forgetSessionWindow: (sessionKey: string) => Promise<void>;
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
	navigateTab,
	closeTab,
	sessionWindowId,
	forgetSessionWindow,
} = (await import(extensionUrl("tabs.js"))) as TabsModule;

afterEach(() => {
	delete (globalThis as { chrome?: unknown }).chrome;
});

it("AC3: tab.list 只返回本会话窗口里的标签", async () => {
	const stub = stubTabsChrome({ windowId: 9 });
	stub.tabs.query.mockResolvedValueOnce([
		{ id: 3, active: true, windowId: 9, title: "a", url: "https://a/" },
		{ id: 4, active: false, windowId: 9, title: "b", url: "https://b/" },
	]);

	const tabs = await listTabs({ sessionKey: "s1" });

	expect(stub.tabs.query).toHaveBeenCalledWith({ windowId: 9 });
	expect(tabs).toStrictEqual([
		{ id: 3, active: true, title: "a", url: "https://a/" },
		{ id: 4, active: false, title: "b", url: "https://b/" },
	]);
});

it("AC3: 还没有会话窗口时 tab.list 返回空", async () => {
	const stub = stubTabsChrome();

	const tabs = await listTabs({ sessionKey: "s1" });

	expect(tabs).toStrictEqual([]);
	expect(stub.tabs.query).not.toHaveBeenCalled();
});

it("AC2: 还没有会话窗口时新建窗口，并用它带的标签", async () => {
	const stub = stubTabsChrome();
	stub.windows.create.mockResolvedValueOnce({
		id: 9,
		tabs: [{ id: 21, active: true, windowId: 9 }],
	});
	stub.tabs.get.mockResolvedValueOnce({
		id: 21,
		active: true,
		windowId: 9,
		title: "a",
		url: "https://a/",
	});

	const tab = await newTab({ sessionKey: "s1", url: "https://a/" });

	expect(stub.windows.create).toHaveBeenCalledWith({ focused: false });
	expect(stub.tabs.update).toHaveBeenCalledWith(21, { url: "https://a/" });
	expect(stub.store["tabs.windowId.s1"]).toBe(9);
	expect(stub.localStore["tabs.windowId.s1"]).toBe(9);
	expect(stub.tabs.create).not.toHaveBeenCalled();
	expect(tab).toStrictEqual({
		id: 21,
		active: true,
		title: "a",
		url: "https://a/",
	});
});

it("AC2: 已有会话窗口时新标签进同一个窗口", async () => {
	const stub = stubTabsChrome({ windowId: 9 });
	stub.tabs.create.mockResolvedValueOnce({ id: 22, windowId: 9 } as Tab);
	stub.tabs.get.mockResolvedValueOnce({
		id: 22,
		active: false,
		windowId: 9,
		title: "b",
		url: "https://b/",
	} as Tab);

	await newTab({ sessionKey: "s1", url: "https://b/", background: true });

	expect(stub.tabs.create).toHaveBeenCalledWith({
		windowId: 9,
		url: "https://b/",
		active: false,
	});
	expect(stub.windows.create).not.toHaveBeenCalled();
});

it("AC2: 会话窗口被用户关掉后重开一个", async () => {
	const stub = stubTabsChrome({ windowId: 9 });
	stub.windows.get.mockRejectedValueOnce(new Error("No window with id 9"));
	stub.windows.create.mockResolvedValueOnce({
		id: 12,
		tabs: [{ id: 31, active: true, windowId: 12 }],
	});
	stub.tabs.get.mockResolvedValueOnce({
		id: 31,
		active: true,
		windowId: 12,
	} as Tab);

	await newTab({ sessionKey: "s1", url: "https://c/" });

	expect(stub.windows.create).toHaveBeenCalledTimes(1);
	expect(stub.store["tabs.windowId.s1"]).toBe(12);
});

it("质量: 两个 sessionKey 各用各的窗口", async () => {
	const stub = stubTabsChrome();
	stub.windows.create
		.mockResolvedValueOnce({
			id: 9,
			tabs: [{ id: 41, active: true, windowId: 9 }],
		})
		.mockResolvedValueOnce({
			id: 10,
			tabs: [{ id: 42, active: true, windowId: 10 }],
		});
	stub.tabs.get
		.mockResolvedValueOnce({ id: 41, windowId: 9 } as Tab)
		.mockResolvedValueOnce({ id: 42, windowId: 10 } as Tab);

	await newTab({ sessionKey: "s1", url: "https://a/" });
	await newTab({ sessionKey: "s2", url: "https://b/" });

	expect(stub.windows.create).toHaveBeenCalledTimes(2);
	expect(stub.store["tabs.windowId.s1"]).toBe(9);
	expect(stub.store["tabs.windowId.s2"]).toBe(10);
});

it("AC4: 后台模式 tab.activate 抛错且不调用 tabs.update", async () => {
	const stub = stubTabsChrome();

	await expect(activateTab({ tabId: 5, background: true })).rejects.toThrow(
		"background mode",
	);

	expect(stub.tabs.update).not.toHaveBeenCalled();
	expect(stub.windows.update).not.toHaveBeenCalled();
});

it("AC4: 前台模式激活标签，并把它的窗口带到前台", async () => {
	const stub = stubTabsChrome();
	stub.tabs.update.mockResolvedValueOnce({
		id: 5,
		active: true,
		windowId: 9,
		title: "a",
		url: "https://a/",
	} as Tab);

	const tab = await activateTab({ tabId: 5, background: false });

	expect(stub.tabs.update).toHaveBeenCalledWith(5, { active: true });
	expect(stub.windows.update).toHaveBeenCalledWith(9, { focused: true });
	expect(tab.id).toBe(5);
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
		windowId: 9,
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

	expect(order).toStrictEqual([
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

it("质量: 缺 sessionKey 或超时时抛明确错误", async () => {
	const stub = stubTabsChrome();

	await expect(listTabs({} as { sessionKey: string })).rejects.toThrow(
		"sessionKey is required",
	);
	await expect(newTab({ sessionKey: "" })).rejects.toThrow(
		"sessionKey is required",
	);
	await expect(navigateTab({ tabId: 1, url: "https://a/" })).rejects.toThrow(
		"timeoutMs is required",
	);

	expect(stub.tabs.create).not.toHaveBeenCalled();
	expect(stub.windows.create).not.toHaveBeenCalled();
	expect(stub.tabs.update).not.toHaveBeenCalled();
	expect(stub.tabs.onUpdated.addListener).not.toHaveBeenCalled();
});

it("交付物: tab.close 关闭标签", async () => {
	const stub = stubTabsChrome();

	const result = await closeTab({ tabId: 31 });

	expect(stub.tabs.remove).toHaveBeenCalledWith(31);
	expect(result).toStrictEqual({ closed: 31 });
});

it("交付物: 会话结束清掉窗口台账", async () => {
	const stub = stubTabsChrome({ windowId: 9 });

	await forgetSessionWindow("s1");

	expect(await sessionWindowId("s1")).toBeUndefined();
	expect(stub.store["tabs.windowId.s1"]).toBeUndefined();
	expect(stub.localStore["tabs.windowId.s1"]).toBeUndefined();
});
