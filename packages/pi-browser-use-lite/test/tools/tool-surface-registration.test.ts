import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { afterEach, expect, it } from "vitest";
import { DEFAULTS } from "../../src/config/index.ts";
import piBrowserUseLite from "../../src/index.ts";
import { TOOL_SPECS } from "../../src/tools/index.ts";
import { cleanupConfig, fakeApi, useConfig } from "../helpers/extension-api.ts";

function toolNames(registered: ToolDefinition[]): string[] {
	return registered.map((tool) => tool.name);
}

afterEach(cleanupConfig);

it("AC11: before_agent_start 后 promptGuidelines 等于默认全局规则", () => {
	useConfig();
	const { api, startRun } = fakeApi();
	piBrowserUseLite(api);

	const options = startRun([]);
	expect(options.promptGuidelines).toStrictEqual(DEFAULTS.prompt.guidelines);
});

it("AC12: prompt.guidelines 覆盖后只剩它，工具自身规则不受影响", () => {
	useConfig({ prompt: { guidelines: ["x"] } });
	const { api, registered, startRun } = fakeApi();
	piBrowserUseLite(api);

	expect(startRun([]).promptGuidelines).toStrictEqual(["x"]);
	const act = registered.find((tool) => tool.name === "chrome_act");
	expect(act?.promptGuidelines).toStrictEqual(
		TOOL_SPECS.chrome_act.promptGuidelines,
	);
});

it("关掉某个工具后，系统提示里不再有点名它的规则", () => {
	// chrome_act 例外：它是分派器，全局内置规则全部点名它。
	for (const id of [
		"chrome_see",
		"chrome_tab",
		"chrome_vision",
		"chrome_cdp",
	]) {
		useConfig({ tools: { [id]: { enabled: false } } });
		const { api, registered, startRun } = fakeApi();
		piBrowserUseLite(api);

		const rules = [
			...startRun([]).promptGuidelines,
			...registered.flatMap((tool) => tool.promptGuidelines ?? []),
		];
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
	expect(act?.promptGuidelines).toStrictEqual(["a", "b"]);
});
