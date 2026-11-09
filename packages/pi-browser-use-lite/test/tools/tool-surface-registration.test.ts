import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { afterEach, expect, it } from "vitest";
import piBrowserUseLite from "../../src/index.ts";
import { cleanupConfig, fakeApi, useConfig } from "../helpers/extension-api.ts";

function toolNames(registered: ToolDefinition[]): string[] {
	return registered.map((tool) => tool.name);
}

afterEach(cleanupConfig);

it("关掉某个工具后，系统提示里不再有点名它的规则", () => {
	for (const id of [
		"chrome_act",
		"chrome_see",
		"chrome_tab",
		"chrome_vision",
		"chrome_cdp",
	]) {
		useConfig({ tools: { [id]: { enabled: false } } });
		const { api, registered } = fakeApi();
		piBrowserUseLite(api);

		const rules = registered.flatMap((tool) => tool.promptGuidelines ?? []);
		expect(rules.filter((rule) => rule.startsWith(`${id}: `))).toStrictEqual(
			[],
		);
	}
});

it("AC6: 关掉 chrome_cdp 时注册 4 个工具，规则里没有 chrome_cdp", () => {
	useConfig({ tools: { chrome_cdp: { enabled: false } } });
	const { api, registered } = fakeApi();
	piBrowserUseLite(api);

	expect(toolNames(registered)).toStrictEqual([
		"chrome_act",
		"chrome_see",
		"chrome_tab",
		"chrome_vision",
	]);
	const rules = registered.flatMap((tool) => tool.promptGuidelines ?? []);
	expect(rules.some((rule) => rule.startsWith("chrome_cdp: "))).toBe(false);
});

it("AC7: 改名后第一个注册的工具用新名字", () => {
	useConfig({ tools: { chrome_act: { name: "chrome_click" } } });
	const { api, registered } = fakeApi();
	piBrowserUseLite(api);

	expect(toolNames(registered)[0]).toBe("chrome_click");
});

it("AC8: guidance.<id>.description 覆盖工具说明", () => {
	useConfig({ guidance: { chrome_see: { description: "X" } } });
	const { api, registered } = fakeApi();
	piBrowserUseLite(api);

	const see = registered.find((tool) => tool.name === "chrome_see");
	expect(see?.description).toBe("X");
});

it("AC9: guidance.<id>.promptGuidelines 整段替换该工具的规则", () => {
	useConfig({ guidance: { chrome_act: { promptGuidelines: ["a", "b"] } } });
	const { api, registered } = fakeApi();
	piBrowserUseLite(api);

	const act = registered.find((tool) => tool.name === "chrome_act");
	expect(act?.promptGuidelines).toStrictEqual([
		"chrome_act: a",
		"chrome_act: b",
	]);
});

it("改名后规则跟着用新名字", () => {
	useConfig({ tools: { chrome_tab: { name: "browser_tabs" } } });
	const { api, registered } = fakeApi();
	piBrowserUseLite(api);

	const rules = registered.find(
		(tool) => tool.name === "browser_tabs",
	)?.promptGuidelines;
	expect(rules?.length).toBeGreaterThan(0);
	expect(rules?.every((rule) => rule.startsWith("browser_tabs: "))).toBe(true);
	expect(
		registered
			.flatMap((tool) => tool.promptGuidelines ?? [])
			.some((rule) => rule.startsWith("chrome_tab: ")),
	).toBe(false);
});
