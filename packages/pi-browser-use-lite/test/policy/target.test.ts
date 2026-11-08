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
		groupName?: string;
		groupColor?: string;
		background?: boolean;
	}) => Promise<number>;
	targetFor: (params: {
		sessionKey?: string;
		action?: string;
		url?: string;
		groupName?: string;
		groupColor?: string;
		background?: boolean;
	}) => Promise<number>;
	cleanupAutomation: (params: {
		sessionKey?: string;
		closeOwnTabs?: boolean;
	}) => Promise<{ closed: number[] }>;
}

const { createTarget, targetFor, cleanupAutomation } = (await import(
	extensionUrl("target.js")
)) as TargetModule;

/** 让桩的标签页有状态：create 分配递增 id，query 返回还开着的标签，remove 关掉。 */
function liveTabs(stub: TabsChromeStub, initial: Tab[] = []): Map<number, Tab> {
	const open = new Map<number, Tab>(initial.map((tab) => [tab.id, tab]));
	let next = 100;
	stub.tabs.query.mockImplementation(async () => [...open.values()]);
	stub.tabs.create.mockImplementation(
		async (spec: { url?: string; active?: boolean }) => {
			const tab: Tab = {
				id: next++,
				active: spec.active,
				groupId: -1,
				title: "",
				url: spec.url ?? "",
			};
			open.set(tab.id, tab);
			return tab;
		},
	);
	stub.tabs.group.mockImplementation(
		async (spec: { groupId?: number; tabIds: number[] }) => {
			for (const id of spec.tabIds) {
				const tab = open.get(id);
				if (tab) tab.groupId = spec.groupId ?? 7;
			}
			return spec.groupId ?? 7;
		},
	);
	stub.tabs.get.mockImplementation(async (id: number) => open.get(id) as Tab);
	stub.tabs.remove.mockImplementation(async (ids: number | number[]) => {
		for (const id of Array.isArray(ids) ? ids : [ids]) open.delete(id);
	});
	return open;
}

/** 建一个 target 用的固定参数。 */
const CREATE = { groupName: "Pi", groupColor: "blue" };

afterEach(() => {
	delete (globalThis as { chrome?: unknown }).chrome;
});

it("AC2: 两个 sessionKey 各得一个 target", async () => {
	const stub = stubTabsChrome();
	liveTabs(stub);

	const a = await targetFor({
		sessionKey: "s1",
		action: "page.navigate",
		url: "https://a/",
		...CREATE,
	});
	const b = await targetFor({
		sessionKey: "s2",
		action: "page.navigate",
		url: "https://b/",
		...CREATE,
	});

	expect(a).not.toBe(b);
	expect(stub.tabs.create).toHaveBeenCalledTimes(2);
	expect(stub.store["target.tabId.s1"]).toBe(a);
	expect(stub.store["target.tabId.s2"]).toBe(b);
	expect(stub.store["target.owned.s1"]).toStrictEqual([a]);
	expect(stub.store["target.group.s1"]).toBe(7);
});

it("AC2: 已有 target 时复用，不重复建", async () => {
	const stub = stubTabsChrome();
	liveTabs(stub);

	const first = await targetFor({
		sessionKey: "s1",
		action: "page.navigate",
		...CREATE,
	});
	const second = await targetFor({ sessionKey: "s1", action: "page.click" });

	expect(second).toBe(first);
	expect(stub.tabs.create).toHaveBeenCalledTimes(1);
});

it("AC5: 扩展重载后从 storage.local 读回 target", async () => {
	const stub = stubTabsChrome();
	liveTabs(stub);

	const created = await targetFor({
		sessionKey: "s1",
		action: "page.navigate",
		...CREATE,
	});
	// 扩展重载会清空 storage.session，storage.local 留着。
	for (const key of Object.keys(stub.store)) delete stub.store[key];

	expect(await targetFor({ sessionKey: "s1", action: "page.snapshot" })).toBe(
		created,
	);
	expect(stub.localStore["target.tabId.s1"]).toBe(created);
});

it("AC6: 用户关掉 target 后报 no_target 且不静默新建；navigate 才建新的", async () => {
	const stub = stubTabsChrome();
	const open = liveTabs(stub);

	const created = await targetFor({
		sessionKey: "s1",
		action: "page.navigate",
		...CREATE,
	});
	open.delete(created);
	const createsBefore = stub.tabs.create.mock.calls.length;

	await expect(
		targetFor({ sessionKey: "s1", action: "page.snapshot" }),
	).rejects.toThrow(/^no_target: /);
	expect(stub.tabs.create.mock.calls.length).toBe(createsBefore);

	const recreated = await targetFor({
		sessionKey: "s1",
		action: "page.navigate",
		url: "https://c/",
		...CREATE,
	});
	expect(recreated).not.toBe(created);
	expect(stub.store["target.tabId.s1"]).toBe(recreated);
});

it("AC8: tab.activate、tab.group、tab.close、cdp.call 不建也不激活 target", async () => {
	const stub = stubTabsChrome();
	liveTabs(stub);

	for (const action of ["tab.activate", "tab.group", "tab.close", "cdp.call"]) {
		await expect(
			targetFor({ sessionKey: "s1", action, ...CREATE }),
		).rejects.toThrow(/^no_target: /);
	}

	expect(stub.tabs.create).not.toHaveBeenCalled();
	expect(stub.tabs.update).not.toHaveBeenCalled();
});

it("AC3: 清理一个会话，另一个会话的 target 还在", async () => {
	const stub = stubTabsChrome();
	const open = liveTabs(stub);

	const a = await targetFor({
		sessionKey: "s1",
		action: "page.navigate",
		...CREATE,
	});
	const b = await targetFor({
		sessionKey: "s2",
		action: "page.navigate",
		...CREATE,
	});

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

it("AC4: 清理只关本会话创建的标签，不关用户加进组里的标签", async () => {
	const stub = stubTabsChrome();
	const open = liveTabs(stub, [
		{ id: 9, groupId: 7, title: "user", url: "https://user/" },
	]);

	const created = await targetFor({
		sessionKey: "s1",
		action: "page.navigate",
		...CREATE,
	});

	await cleanupAutomation({ sessionKey: "s1", closeOwnTabs: true });

	expect(open.has(created)).toBe(false);
	expect(open.has(9)).toBe(true);
	expect(stub.tabs.remove).toHaveBeenCalledTimes(1);
	expect(stub.tabs.remove).toHaveBeenCalledWith([created]);
});

it("AC7: closeOwnTabs 为 false 时保留标签，台账清掉", async () => {
	const stub = stubTabsChrome();
	const open = liveTabs(stub);

	const created = await targetFor({
		sessionKey: "s1",
		action: "page.navigate",
		...CREATE,
	});

	const { closed } = await cleanupAutomation({
		sessionKey: "s1",
		closeOwnTabs: false,
	});

	expect(closed).toStrictEqual([]);
	expect(open.has(created)).toBe(true);
	expect(stub.tabs.remove).not.toHaveBeenCalled();
	expect(stub.store["target.tabId.s1"]).toBeUndefined();
	expect(stub.store["target.owned.s1"]).toBeUndefined();
	expect(stub.localStore["target.tabId.s1"]).toBeUndefined();
});

it("质量: 清理时 closeOwnTabs 必须显式给", async () => {
	liveTabs(stubTabsChrome());

	await expect(cleanupAutomation({ sessionKey: "s1" })).rejects.toThrow(
		"closeOwnTabs is required",
	);
});

it("AC8: 已有 target 时四个只读动作复用它，不建也不激活", async () => {
	const stub = stubTabsChrome();
	liveTabs(stub);

	const created = await targetFor({
		sessionKey: "s1",
		action: "page.navigate",
		...CREATE,
	});

	for (const action of ["tab.activate", "tab.group", "tab.close", "cdp.call"]) {
		expect(await targetFor({ sessionKey: "s1", action })).toBe(created);
	}
	expect(stub.tabs.create).toHaveBeenCalledTimes(1);
	expect(stub.tabs.update).not.toHaveBeenCalled();
});

it("质量: 台账里的旧 id 被用户的标签占用时既不认也不关", async () => {
	const stub = stubTabsChrome();
	const open = liveTabs(stub, [
		{ id: 5, groupId: 7, title: "user", url: "https://user/" },
	]);
	// 扩展重载后 storage.session 空了，local 里留着上次的 target id；浏览器把 5 分给了用户的标签。
	stub.localStore["target.tabId.s1"] = 5;

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
	const open = liveTabs(stub);

	const created = await createTarget({
		sessionKey: "s1",
		url: "https://new/",
		...CREATE,
	});

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
	liveTabs(stubTabsChrome());

	await expect(targetFor({ action: "page.click" })).rejects.toThrow(
		"sessionKey is required",
	);
	await expect(targetFor({ sessionKey: "s1" })).rejects.toThrow(
		"action is required",
	);
});
