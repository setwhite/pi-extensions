import { afterEach, expect, it, vi } from "vitest";
import { ACTION_NAMES } from "../../src/protocol/index.ts";

interface DispatchModule {
	routes: Map<
		string,
		((params?: Record<string, unknown>) => unknown) | undefined
	>;
	dispatch: (
		action: string,
		params?: Record<string, unknown>,
	) => Promise<unknown>;
}

/** 扩展侧的 JS 没有类型声明，用文件 URL 动态载入。 */
function extensionUrl(path: string): string {
	return new URL(`../../browser-extension/background/${path}`, import.meta.url)
		.href;
}

/** 接线测试只关心「谁被调用、收到什么」，所以被接的模块全部换成桩。 */
const modules = [
	"tabs.js",
	"target.js",
	"page/snapshot.js",
	"page/screenshot.js",
	"page/evaluate.js",
	"input/debugger.js",
	"input/pointer.js",
	"input/keyboard.js",
	"input/upload.js",
] as const;

vi.mock(extensionUrl("tabs.js"), () => ({
	listTabs: vi.fn(async () => [{ id: 7 }]),
	activateTab: vi.fn(async () => ({ id: 7 })),
	navigateTab: vi.fn(async () => ({ id: 7, url: "https://a" })),
	closeTab: vi.fn(async () => ({ closed: 7 })),
	groupTab: vi.fn(async () => ({ id: 7 })),
}));

vi.mock(extensionUrl("target.js"), () => ({
	createTarget: vi.fn(async () => 21),
	targetFor: vi.fn(async () => 7),
	cleanupAutomation: vi.fn(async () => ({ closed: [7] })),
}));

vi.mock(extensionUrl("page/snapshot.js"), () => ({
	snapshotPage: vi.fn(async () => ({ mode: "refs", url: "https://a" })),
	elementAt: vi.fn(async () => ({
		url: "https://a",
		element: { rect: { x: 10, y: 20, width: 30, height: 40 } },
	})),
	markBaseline: vi.fn(async () => undefined),
	changesSince: vi.fn(async () => ({ added: 1, removed: 2, updated: 3 })),
}));

vi.mock(extensionUrl("page/screenshot.js"), () => ({
	screenshotPage: vi.fn(async () => ({ format: "png", images: [] })),
}));

vi.mock(extensionUrl("page/evaluate.js"), () => ({
	evaluatePage: vi.fn(async () => ({ value: 42 })),
}));

vi.mock(extensionUrl("input/debugger.js"), () => ({
	sendCommand: vi.fn(async () => ({ ok: 1 })),
}));

vi.mock(extensionUrl("input/pointer.js"), () => ({
	click: vi.fn(async () => ({ x: 1, y: 2 })),
	hover: vi.fn(async () => ({ x: 1, y: 2 })),
	drag: vi.fn(async () => ({ from: { x: 1, y: 2 }, to: { x: 3, y: 4 } })),
	scroll: vi.fn(async () => ({ deltaX: 0, deltaY: 100 })),
}));

vi.mock(extensionUrl("input/keyboard.js"), () => ({
	press: vi.fn(async () => ({ key: "Enter" })),
	type: vi.fn(async () => ({ length: 5, mode: "keys" })),
	fill: vi.fn(async () => ({ filled: ["#q"] })),
}));

vi.mock(extensionUrl("input/upload.js"), () => ({
	upload: vi.fn(async () => ({ uploaded: ["/tmp/a"] })),
}));

const { routes, dispatch } = (await import(
	extensionUrl("dispatch.js")
)) as DispatchModule;

/** 被接的模块。断言调用参数时从这里取 vi.fn。 */
async function moduleOf(path: (typeof modules)[number]) {
	return (await import(extensionUrl(path))) as Record<
		string,
		ReturnType<typeof vi.fn>
	>;
}

/** 还没接的 4 条：三条日志归 T24，page.waitFor 归 T26。 */
const UNWIRED = [
	"page.console.list",
	"page.network.list",
	"page.network.get",
	"page.waitFor",
];

/** 挂一个只记账的 chrome 桩，供 tab.version 用。 */
function stubChrome(version: string): void {
	(globalThis as { chrome?: unknown }).chrome = {
		runtime: { getManifest: () => ({ version }) },
	};
}

afterEach(() => {
	delete (globalThis as { chrome?: unknown }).chrome;
	vi.clearAllMocks();
});

it("AC2: 未知动作抛 Unknown action", async () => {
	await expect(dispatch("page.tap")).rejects.toThrow(
		"Unknown action: page.tap",
	);
});

it("AC2: 原型链上的名字也当未知动作", async () => {
	for (const action of [
		"toString",
		"constructor",
		"hasOwnProperty",
		"__proto__",
	])
		await expect(dispatch(action)).rejects.toThrow(`Unknown action: ${action}`);
});

it("AC2: 除日志三条与 waitFor 外的动作都接上了", () => {
	const missing = [...routes]
		.filter(
			([action, route]) => route === undefined && !UNWIRED.includes(action),
		)
		.map(([action]) => action);

	expect(missing).toStrictEqual([]);
	expect([...routes.keys()].sort()).toStrictEqual([...ACTION_NAMES].sort());
});

it("AC2: 没接的动作仍报未接，不报 Unknown action", async () => {
	for (const action of UNWIRED)
		await expect(dispatch(action, {})).rejects.toThrow(
			`${action} is not wired yet`,
		);
});

it("tab.version 报出清单版本", async () => {
	stubChrome("0.1.0");

	expect(await dispatch("tab.version")).toEqual({ extensionVersion: "0.1.0" });
});

it("AC7: automation.cleanup 走 cleanupAutomation", async () => {
	const target = await moduleOf("target.js");

	const result = await dispatch("automation.cleanup", {
		sessionKey: "s1",
		closeOwnTabs: false,
	});

	expect(target.cleanupAutomation).toHaveBeenCalledWith({
		sessionKey: "s1",
		closeOwnTabs: false,
	});
	expect(result).toEqual({ closed: [7] });
});

it("AC8: tab.new 走 createTarget，回标签 id", async () => {
	const target = await moduleOf("target.js");

	const result = await dispatch("tab.new", {
		sessionKey: "s1",
		url: "https://a",
		groupName: "Pi",
		groupColor: "blue",
		background: true,
	});

	expect(target.createTarget).toHaveBeenCalledWith({
		sessionKey: "s1",
		url: "https://a",
		groupName: "Pi",
		groupColor: "blue",
		background: true,
	});
	expect(result).toEqual({ id: 21 });
});

it("tab.list 把 tabs 包进信封", async () => {
	const tabs = await moduleOf("tabs.js");

	expect(await dispatch("tab.list", { sessionKey: "s1" })).toEqual({
		tabs: [{ id: 7 }],
	});
	expect(tabs.listTabs).toHaveBeenCalledWith({ sessionKey: "s1" });
});

it("AC3: 不带 tabId 时按 targetFor 取 target", async () => {
	const target = await moduleOf("target.js");
	const snapshot = await moduleOf("page/snapshot.js");

	await dispatch("page.snapshot", {
		sessionKey: "s1",
		mode: "text",
		maxElements: 80,
		textChars: 4000,
	});

	expect(target.targetFor).toHaveBeenCalledWith({
		sessionKey: "s1",
		action: "page.snapshot",
		url: undefined,
		groupName: undefined,
		groupColor: undefined,
		background: true,
	});
	expect(snapshot.snapshotPage).toHaveBeenCalledWith({
		tabId: 7,
		mode: "text",
		query: undefined,
		ref: undefined,
		selector: undefined,
		maxElements: 80,
		textChars: 4000,
	});
});

it("AC3: tabId 不是整数时报错，退回会话 target 会作用到别的标签", async () => {
	const target = await moduleOf("target.js");

	await expect(
		dispatch("page.snapshot", { sessionKey: "s1", tabId: "9" }),
	).rejects.toThrow("bad_args: tabId must be an integer, got 9");
	expect(target.targetFor).not.toHaveBeenCalled();
});

it("AC3: 带 tabId 时不问 target", async () => {
	const target = await moduleOf("target.js");
	const snapshot = await moduleOf("page/snapshot.js");

	await dispatch("page.snapshot", {
		maxElements: 80,
		textChars: 4000,
		tabId: 9,
	});

	expect(target.targetFor).not.toHaveBeenCalled();
	expect(snapshot.snapshotPage).toHaveBeenCalledWith(
		expect.objectContaining({ tabId: 9 }),
	);
});

it("AC4: navigate 把 initScript 与超时原样转给 tabs", async () => {
	const tabs = await moduleOf("tabs.js");

	await dispatch("page.navigate", {
		sessionKey: "s1",
		url: "https://a",
		initScript: "void 0",
		timeoutMs: 17_000,
		groupName: "Pi",
		groupColor: "blue",
	});

	expect(tabs.navigateTab).toHaveBeenCalledWith(
		expect.objectContaining({
			tabId: 7,
			url: "https://a",
			initScript: "void 0",
			timeoutMs: 17_000,
		}),
	);
});

it("AC4: ref 换成坐标再交给 pointer，pointer 从不见 ref", async () => {
	const pointer = await moduleOf("input/pointer.js");

	await dispatch("page.click", { sessionKey: "s1", ref: "e12" });

	expect(pointer.click).toHaveBeenCalledWith({ tabId: 7, x: 25, y: 40 });
});

it("AC4: selector 与坐标直接透传", async () => {
	const pointer = await moduleOf("input/pointer.js");

	await dispatch("page.hover", { sessionKey: "s1", selector: "#go" });

	expect(pointer.hover).toHaveBeenCalledWith({
		tabId: 7,
		selector: "#go",
		x: undefined,
		y: undefined,
	});
});

it("AC4: type 带 press 时补一次按键", async () => {
	const keyboard = await moduleOf("input/keyboard.js");

	const result = await dispatch("page.type", {
		sessionKey: "s1",
		text: "hello",
		replace: true,
		press: "Enter",
	});

	expect(keyboard.type).toHaveBeenCalledWith({
		tabId: 7,
		text: "hello",
		replace: true,
	});
	expect(keyboard.press).toHaveBeenCalledWith({ tabId: 7, key: "Enter" });
	expect(result).toMatchObject({
		changed: { added: 1, removed: 2, updated: 3 },
	});
});

it("AC5: 交互类动作拍基线再报变更量", async () => {
	const snapshot = await moduleOf("page/snapshot.js");
	const order: string[] = [];
	(snapshot.markBaseline as ReturnType<typeof vi.fn>).mockImplementationOnce(
		async () => {
			order.push("baseline");
		},
	);
	const pointer = await moduleOf("input/pointer.js");
	(pointer.scroll as ReturnType<typeof vi.fn>).mockImplementationOnce(
		async () => {
			order.push("scroll");
			return {};
		},
	);

	const result = await dispatch("page.scroll", { sessionKey: "s1", dy: 300 });

	expect(order).toStrictEqual(["baseline", "scroll"]);
	expect(result).toEqual({ changed: { added: 1, removed: 2, updated: 3 } });
});

it("AC5: 非交互类动作不算变更量", async () => {
	const snapshot = await moduleOf("page/snapshot.js");

	const result = await dispatch("page.evaluate", { sessionKey: "s1", js: "1" });

	expect(snapshot.markBaseline).not.toHaveBeenCalled();
	expect(result).toEqual({ value: 42 });
});

it("AC9: cdp.call 走 sendCommand，结果包成 result", async () => {
	const debuggerModule = await moduleOf("input/debugger.js");

	const result = await dispatch("cdp.call", {
		sessionKey: "s1",
		method: "Page.enable",
		params: { a: 1 },
	});

	expect(debuggerModule.sendCommand).toHaveBeenCalledWith(7, "Page.enable", {
		a: 1,
	});
	expect(result).toEqual({ result: { ok: 1 } });
});

it("AC9: cdp_unavailable 原样抛，不吞也不换类别", async () => {
	const debuggerModule = await moduleOf("input/debugger.js");
	(
		debuggerModule.sendCommand as ReturnType<typeof vi.fn>
	).mockRejectedValueOnce(
		new Error("cdp_unavailable: cannot attach to this tab"),
	);

	await expect(
		dispatch("cdp.call", { sessionKey: "s1", method: "Page.enable" }),
	).rejects.toThrow("cdp_unavailable: cannot attach to this tab");
});

it("AC6: 模块的报错原样上抛，不包信封", async () => {
	const tabs = await moduleOf("tabs.js");
	(tabs.activateTab as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
		new Error("bad_args: tabId must be an integer"),
	);

	await expect(dispatch("tab.activate", { tabId: "x" })).rejects.toThrow(
		"bad_args: tabId must be an integer",
	);
});

it("screenshot 转发 format 与 fullPage", async () => {
	const screenshot = await moduleOf("page/screenshot.js");

	await dispatch("page.screenshot", {
		sessionKey: "s1",
		format: "jpeg",
		fullPage: true,
	});

	expect(screenshot.screenshotPage).toHaveBeenCalledWith({
		tabId: 7,
		format: "jpeg",
		fullPage: true,
	});
});

it("upload 转发路径与超时", async () => {
	const upload = await moduleOf("input/upload.js");

	await dispatch("page.upload", {
		sessionKey: "s1",
		paths: ["/tmp/a"],
		timeoutMs: 30_000,
	});

	expect(upload.upload).toHaveBeenCalledWith({
		tabId: 7,
		paths: ["/tmp/a"],
		timeoutMs: 30_000,
	});
});

it("AC4: 其余动作的参数按 wire 表转发", async () => {
	const keyboard = await moduleOf("input/keyboard.js");
	const pointer = await moduleOf("input/pointer.js");
	const tabs = await moduleOf("tabs.js");
	const snapshot = await moduleOf("page/snapshot.js");

	await dispatch("page.fill", { sessionKey: "s1", fields: [{ ref: "e1" }] });
	await dispatch("page.key", { sessionKey: "s1", key: "Ctrl+A" });
	await dispatch("page.drag", {
		sessionKey: "s1",
		from: { x: 1, y: 2 },
		to: { selector: "#drop" },
		steps: 10,
	});
	await dispatch("tab.group", {
		sessionKey: "s1",
		tabId: 9,
		groupName: "Pi",
		groupColor: "blue",
	});
	await dispatch("tab.activate", { tabId: 9, background: false });
	await dispatch("tab.close", { tabId: 9 });
	await dispatch("page.inspect", { sessionKey: "s1", ref: "e12" });

	expect(keyboard.fill).toHaveBeenCalledWith({
		tabId: 7,
		fields: [{ ref: "e1" }],
	});
	expect(keyboard.press).toHaveBeenCalledWith({ tabId: 7, key: "Ctrl+A" });
	expect(pointer.drag).toHaveBeenCalledWith({
		tabId: 7,
		from: { selector: undefined, x: 1, y: 2 },
		to: { selector: "#drop", x: undefined, y: undefined },
		steps: 10,
	});
	expect(tabs.groupTab).toHaveBeenCalledWith({
		sessionKey: "s1",
		tabId: 9,
		groupName: "Pi",
		groupColor: "blue",
	});
	expect(tabs.activateTab).toHaveBeenCalledWith({
		tabId: 9,
		background: false,
	});
	expect(tabs.closeTab).toHaveBeenCalledWith({ tabId: 9 });
	expect(snapshot.elementAt).toHaveBeenCalledWith(7, {
		ref: "e12",
		selector: undefined,
	});
});

it("AC8: tab.new 之后同一会话的 page.snapshot 只问 target，不再建标签", async () => {
	const target = await moduleOf("target.js");

	await dispatch("tab.new", {
		sessionKey: "s1",
		url: "https://a",
		groupName: "Pi",
		groupColor: "blue",
		background: true,
	});
	await dispatch("page.snapshot", {
		sessionKey: "s1",
		maxElements: 80,
		textChars: 4000,
	});

	expect(target.createTarget).toHaveBeenCalledTimes(1);
	expect(target.targetFor).toHaveBeenCalledWith(
		expect.objectContaining({ sessionKey: "s1", action: "page.snapshot" }),
	);
});
