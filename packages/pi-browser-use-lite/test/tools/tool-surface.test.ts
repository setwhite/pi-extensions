import { expect, it } from "vitest";
import { TOOL_IDS } from "../../src/config/index.ts";
import { buildSurface, TOOL_SPECS } from "../../src/tools/index.ts";

const BUDGET = 12_000;
/** AC5 的第二个断言：加 2,000 字符就必须撞线，所以默认体积要贴近预算。 */
const BUDGET_FLOOR = BUDGET - 2_000;

/** 默认配置下的工具开关：全开、名字等于原名。 */
function defaultSettings(): Record<string, { enabled: boolean; name: string }> {
	return Object.fromEntries(
		TOOL_IDS.map((id) => [id, { enabled: true, name: id }]),
	);
}

const surface = buildSurface(defaultSettings(), {});

interface ParamSchema {
	enum?: readonly string[];
	description?: string;
	properties?: Record<string, ParamSchema>;
	items?: ParamSchema;
}

function propertiesIn(
	tools: readonly { name: string; parameters: unknown }[],
	name: string,
) {
	const tool = tools.find((item) => item.name === name);
	if (tool === undefined) throw new Error(`no tool named ${name}`);
	const parameters = tool.parameters as {
		properties?: Record<string, ParamSchema>;
	};
	return parameters.properties ?? {};
}

function propertiesOf(name: string): Record<string, ParamSchema> {
	return propertiesIn(surface, name);
}

function measure(tools: unknown): number {
	return JSON.stringify(tools).length;
}

/** 递归累加 schema 里所有 description 的长度。 */
function descriptionChars(schema: unknown): number {
	if (typeof schema !== "object" || schema === null) return 0;
	const node = schema as Record<string, unknown>;
	let total =
		typeof node.description === "string" ? node.description.length : 0;
	for (const value of Object.values(node)) {
		if (typeof value === "object" && value !== null)
			total += descriptionChars(value);
	}
	return total;
}

it("AC2: 默认配置下恰好 5 个工具，顺序与工具 id 一致", () => {
	expect(surface.map((tool) => tool.name)).toStrictEqual([...TOOL_IDS]);
	expect(Object.keys(TOOL_SPECS)).toStrictEqual([...TOOL_IDS]);
});

it("AC3: 默认工具面序列化后不超过 12,000 字符", () => {
	expect(measure(surface)).toBeLessThanOrEqual(BUDGET);
});

it("AC5: 加无描述字段不撞线，加 2,000 字符描述撞线", () => {
	const withBareField = structuredClone(surface);
	const bare = propertiesIn(withBareField, "chrome_act");
	bare.extra = { description: undefined };
	expect(measure(withBareField)).toBeLessThanOrEqual(BUDGET);
	expect(measure(withBareField)).toBeGreaterThan(BUDGET_FLOOR);

	const withWordyField = structuredClone(surface);
	const wordy = propertiesIn(withWordyField, "chrome_act");
	wordy.extra = { description: "x".repeat(2_000) };
	expect(measure(withWordyField)).toBeGreaterThan(BUDGET);
});

it("AC4: 各工具的参数与枚举按 SPEC-0001 冻结", () => {
	const act = propertiesOf("chrome_act");
	expect(act.action.enum).toStrictEqual([
		"navigate",
		"click",
		"type",
		"fill",
		"press",
		"hover",
		"drag",
		"scroll",
		"upload",
		"eval",
		"wait",
		"batch",
	]);
	expect(act.action.enum).not.toContain("tap");
	expect(act.see).toBeDefined();
	expect(propertiesOf("chrome_see").mode.enum).toStrictEqual([
		"refs",
		"text",
		"changes",
		"full",
	]);
	expect(propertiesOf("chrome_see").selector).toBeDefined();
	expect(propertiesOf("chrome_tab").action.enum).toStrictEqual([
		"list",
		"new",
		"switch",
		"close",
		"group",
	]);
	expect(Object.keys(propertiesOf("chrome_vision"))).toStrictEqual([
		"full_page",
		"tab",
	]);
	expect(Object.keys(propertiesOf("chrome_cdp"))).toStrictEqual([
		"method",
		"params",
		"tab",
	]);
});

it("AC10: 每个工具的默认规则都以自己的名字开头", () => {
	for (const tool of surface) {
		expect(tool.promptGuidelines.length).toBeGreaterThan(0);
		for (const rule of tool.promptGuidelines) {
			expect(rule.startsWith(`${tool.name}: `)).toBe(true);
		}
	}
});

it("tools 与 config 的 id 列表分叉时抛错，不静默少一个工具", () => {
	const settings = defaultSettings();
	delete settings.chrome_cdp;
	expect(() => buildSurface(settings, {})).toThrow(/chrome_cdp/);
});

it("AC13: 工具描述合计不超过 4,000 字符，参数描述合计不超过 5,500 字符", () => {
	const toolChars = surface.reduce(
		(sum, tool) => sum + tool.description.length,
		0,
	);
	const paramChars = surface.reduce(
		(sum, tool) => sum + descriptionChars(tool.parameters),
		0,
	);
	expect(toolChars).toBeLessThanOrEqual(4_000);
	expect(paramChars).toBeLessThanOrEqual(5_500);
});
