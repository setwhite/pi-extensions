import { afterEach, expect, it } from "vitest";
import { ACTION_NAMES } from "../../src/protocol/index.ts";

interface DispatchModule {
	routes: Map<
		string,
		((params?: Record<string, unknown>) => unknown) | undefined
	>;
	dispatch: (action: string, params?: Record<string, unknown>) => unknown;
}

/** 扩展侧的 JS 没有类型声明，用文件 URL 动态载入。 */
function extensionUrl(path: string): string {
	return new URL(`../../browser-extension/background/${path}`, import.meta.url)
		.href;
}

const { routes, dispatch } = (await import(
	extensionUrl("dispatch.js")
)) as DispatchModule;

/** 挂一个只记账的 chrome 桩，供 tab.version 用。 */
function stubChrome(version: string): void {
	(globalThis as { chrome?: unknown }).chrome = {
		runtime: { getManifest: () => ({ version }) },
	};
}

afterEach(() => {
	delete (globalThis as { chrome?: unknown }).chrome;
});

it("AC2: 未知动作抛 Unknown action", () => {
	expect(() => dispatch("page.tap")).toThrow("Unknown action: page.tap");
});

it("AC2: 原型链上的名字也当未知动作", () => {
	for (const action of [
		"toString",
		"constructor",
		"hasOwnProperty",
		"__proto__",
	])
		expect(() => dispatch(action)).toThrow(`Unknown action: ${action}`);
});

it("动作名齐全但实现没接时报未接，不报 Unknown action", () => {
	expect(() => dispatch("page.click", {})).toThrow(
		"page.click is not wired yet",
	);
});

it("AC3: 路由表的键与 protocol 的动作名一致", () => {
	expect([...routes.keys()].sort()).toEqual([...ACTION_NAMES].sort());
});

it("tab.version 报出清单版本", () => {
	stubChrome("0.1.0");

	expect(dispatch("tab.version")).toEqual({ extensionVersion: "0.1.0" });
});
