import { afterEach, expect, it } from "vitest";
import { extensionUrl } from "../extension/input/chrome-stub.ts";
import {
	stubTabsChrome,
	type Tab,
	type TabsChromeStub,
} from "../extension/tabs-stub.ts";

interface TargetModule {
	createTarget: (params: {
		sessionKey?: string;
		url?: string;
	}) => Promise<number>;
	targetFor: (params: {
		sessionKey?: string;
		action?: string;
	}) => Promise<number>;
	cleanupAutomation: (params: {
		sessionKey?: string;
		closeOwnTabs?: boolean;
	}) => Promise<{ closed: number[] }>;
}

const { createTarget, targetFor, cleanupAutomation } = (await import(
	extensionUrl("target.js")
)) as TargetModule;

/**
 * 让桩有状态：窗口与标签真建真关。
 * create 分配递增 id，query 按窗口过滤，get 找不到就抛，remove 关掉标签。
 */
function liveBrowser(stub: TabsChromeStub, initial: Tab[] = []) {
	const open = new Map<number, Tab>(initial.map((tab) => [tab.id, tab]));
	const windows = new Set<number>([1]);
	let nextTab = 100;
	let nextWindow = 500;
	stub.tabs.query.mockImplementation(async (spec: { windowId?: number } = {}) =>
		[...open.values()].filter(
			(tab) => spec.windowId === undefined || tab.windowId === spec.windowId,
		),
	);
	stub.tabs.create.mockImplementation(
		async (spec: { windowId?: number; url?: string; active?: boolean }) => {
			const tab: Tab = {
				id: nextTab++,
				active: spec.active,
				windowId: spec.windowId,
				title: "",
				url: spec.url ?? "",
			};
			open.set(tab.id, tab);
			return tab;
		},
	);
	stub.tabs.get.mockImplementation(async (id: number) => {
		const tab = open.get(id);
		if (tab === undefined) throw new Error(`No tab with id ${id}`);
		return tab;
	});
	stub.tabs.update.mockImplementation(
		async (id: number, changes: { url?: string; active?: boolean } = {}) => {
			const tab = open.get(id);
			if (tab === undefined) throw new Error(`No tab with id ${id}`);
			const next: Tab = { ...tab, ...changes };
			open.set(id, next);
			return next;
		},
	);
	stub.tabs.remove.mockImplementation(async (ids: number | number[]) => {
		for (const id of Array.isArray(ids) ? ids : [ids]) open.delete(id);
	});
	stub.windows.create.mockImplementation(
		async (spec: { url?: string } = {}) => {
			const windowId = nextWindow++;
			windows.add(windowId);
			const tab: Tab = {
				id: nextTab++,
				active: true,
				windowId,
				title: "",
				url: spec.url ?? "about:blank",
			};
			open.set(tab.id, tab);
			return { id: windowId, tabs: [tab] };
		},
	);
	stub.windows.get.mockImplementation(async (id: number) => {
		if (!windows.has(id)) throw new Error(`No window with id ${id}`);
		return { id };
	});
	stub.windows.update.mockImplementation(async (id: number) => ({ id }));
	return { open, windows };
}

afterEach(() => {
	delete (globalThis as { chrome?: unknown }).chrome;
});

it("AC2: 两个 sessionKey 各得一个窗口与一个 target", async () => {
	const stub = stubTabsChrome();
	const { open } = liveBrowser(stub);

	const a = await targetFor({ sessionKey: "s1", action: "page.navigate" });
	const b = await targetFor({ sessionKey: "s2", action: "page.navigate" });

	expect(a).not.toBe(b);
	expect(stub.windows.create).toHaveBeenCalledTimes(2);
	expect(stub.store["target.tabId.s1"]).toBe(a);
	expect(stub.store["target.tabId.s2"]).toBe(b);
	expect(stub.store["target.owned.s1"]).toStrictEqual([a]);
	expect(open.get(a)?.windowId).toBe(stub.store["tabs.windowId.s1"]);
	expect(open.get(b)?.windowId).toBe(stub.store["tabs.windowId.s2"]);
	expect(stub.store["tabs.windowId.s1"]).not.toBe(
		stub.store["tabs.windowId.s2"],
	);
});

it("AC2: 已有 target 时复用，不重复建窗口", async () => {
	const stub = stubTabsChrome();
	liveBrowser(stub);

	const first = await targetFor({ sessionKey: "s1", action: "page.navigate" });
	const second = await targetFor({ sessionKey: "s1", action: "page.click" });

	expect(second).toBe(first);
	expect(stub.windows.create).toHaveBeenCalledTimes(1);
	expect(stub.tabs.create).not.toHaveBeenCalled();
});

it("AC5: 扩展重载后从 storage.local 读回 target 与窗口", async () => {
	const stub = stubTabsChrome();
	liveBrowser(stub);

	const created = await targetFor({
		sessionKey: "s1",
		action: "page.navigate",
	});
	// 扩展重载会清空 storage.session，storage.local 留着。
	for (const key of Object.keys(stub.store)) delete stub.store[key];

	expect(await targetFor({ sessionKey: "s1", action: "page.snapshot" })).toBe(
		created,
	);
	expect(stub.localStore["target.tabId.s1"]).toBe(created);
	expect(stub.localStore["tabs.windowId.s1"]).toBeDefined();
});

it("AC6: 用户关掉 target 后报 no_target 且不静默新建；navigate 才建新的", async () => {
	const stub = stubTabsChrome();
	const { open } = liveBrowser(stub);

	const created = await targetFor({
		sessionKey: "s1",
		action: "page.navigate",
	});
	open.delete(created);
	const windowsBefore = stub.windows.create.mock.calls.length;

	await expect(
		targetFor({ sessionKey: "s1", action: "page.snapshot" }),
	).rejects.toThrow(/^no_target: /);
	expect(stub.windows.create.mock.calls.length).toBe(windowsBefore);

	const recreated = await targetFor({
		sessionKey: "s1",
		action: "page.navigate",
	});
	expect(recreated).not.toBe(created);
	expect(stub.store["target.tabId.s1"]).toBe(recreated);
});

it("AC8: tab.activate、tab.close、cdp.call 不建也不激活 target", async () => {
	const stub = stubTabsChrome();
	liveBrowser(stub);

	for (const action of ["tab.activate", "tab.close", "cdp.call"])
		await expect(targetFor({ sessionKey: "s1", action })).rejects.toThrow(
			/^no_target: /,
		);

	expect(stub.windows.create).not.toHaveBeenCalled();
	expect(stub.tabs.update).not.toHaveBeenCalled();
});

it("AC3: 清理一个会话，另一个会话的 target 还在", async () => {
	const stub = stubTabsChrome();
	const { open } = liveBrowser(stub);

	const a = await targetFor({ sessionKey: "s1", action: "page.navigate" });
	const b = await targetFor({ sessionKey: "s2", action: "page.navigate" });

	const { closed } = await cleanupAutomation({
		sessionKey: "s1",
		closeOwnTabs: true,
	});

	expect(closed).toStrictEqual([a]);
	expect(open.has(a)).toBe(false);
	expect(open.has(b)).toBe(true);
	expect(await targetFor({ sessionKey: "s2", action: "page.snapshot" })).toBe(
		b,
	);
	expect(
		await targetFor({ sessionKey: "s1", action: "page.snapshot" }).catch(
			(error: Error) => error.message,
		),
	).toMatch(/^no_target: /);
});

it("AC4: 清理只关本会话窗口里的自有标签，不关用户窗口里的标签", async () => {
	const stub = stubTabsChrome();
	const { open } = liveBrowser(stub, [
		{ id: 5, active: true, windowId: 1, title: "user", url: "https://user/" },
	]);

	const created = await targetFor({
		sessionKey: "s1",
		action: "page.navigate",
	});

	await cleanupAutomation({ sessionKey: "s1", closeOwnTabs: true });

	expect(open.has(created)).toBe(false);
	expect(open.has(5)).toBe(true);
	expect(stub.tabs.remove).toHaveBeenCalledTimes(1);
	expect(stub.tabs.remove).toHaveBeenCalledWith([created]);
});

it("AC7: closeOwnTabs 为 false 时保留标签，台账清掉", async () => {
	const stub = stubTabsChrome();
	const { open } = liveBrowser(stub);

	const created = await targetFor({
		sessionKey: "s1",
		action: "page.navigate",
	});

	const { closed } = await cleanupAutomation({
		sessionKey: "s1",
		closeOwnTabs: false,
	});

	expect(closed).toStrictEqual([]);
	expect(open.has(created)).toBe(true);
	expect(stub.tabs.remove).not.toHaveBeenCalled();
	for (const key of ["target.tabId.s1", "target.owned.s1", "tabs.windowId.s1"])
		expect(stub.store[key]).toBeUndefined();
	expect(stub.localStore["target.tabId.s1"]).toBeUndefined();
});

it("质量: 清理时 closeOwnTabs 必须显式给", async () => {
	liveBrowser(stubTabsChrome());

	await expect(cleanupAutomation({ sessionKey: "s1" })).rejects.toThrow(
		"closeOwnTabs is required",
	);
});

it("质量: 台账里的标签不在本会话窗口时既不认也不关", async () => {
	const stub = stubTabsChrome();
	const { open } = liveBrowser(stub, [
		{ id: 5, active: true, windowId: 1, title: "user", url: "https://user/" },
	]);
	// local 里留着上次的 target id，但本会话的窗口是另一个，5 是用户的标签。
	stub.localStore["target.tabId.s1"] = 5;
	stub.localStore["tabs.windowId.s1"] = 900;
	stub.windows.get.mockImplementation(async (id: number) => ({ id }));

	await expect(
		targetFor({ sessionKey: "s1", action: "page.snapshot" }),
	).rejects.toThrow(/^no_target: /);

	const { closed } = await cleanupAutomation({
		sessionKey: "s1",
		closeOwnTabs: true,
	});

	expect(closed).toStrictEqual([]);
	expect(stub.tabs.remove).not.toHaveBeenCalled();
	expect(open.has(5)).toBe(true);
	expect(stub.localStore["target.tabId.s1"]).toBeUndefined();
});

it("质量: chrome_tab new 走 createTarget，新标签成为 target 并被清理关掉", async () => {
	const stub = stubTabsChrome();
	const { open } = liveBrowser(stub);

	const created = await createTarget({ sessionKey: "s1", url: "https://new/" });

	expect(await targetFor({ sessionKey: "s1", action: "page.snapshot" })).toBe(
		created,
	);
	expect(stub.store["target.owned.s1"]).toStrictEqual([created]);

	const { closed } = await cleanupAutomation({
		sessionKey: "s1",
		closeOwnTabs: true,
	});

	expect(closed).toStrictEqual([created]);
	expect(open.has(created)).toBe(false);
});

it("质量: 缺 sessionKey 或 action 时抛明确错误", async () => {
	liveBrowser(stubTabsChrome());

	await expect(targetFor({ action: "page.click" })).rejects.toThrow(
		"sessionKey is required",
	);
	await expect(targetFor({ sessionKey: "s1" })).rejects.toThrow(
		"action is required",
	);
});
