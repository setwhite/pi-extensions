import { expect, it } from "vitest";
import { harness, textOf } from "./harness.ts";

const TABS = [
	{
		id: 12,
		active: true,
		group: "Pi",
		title: "Issues",
		url: "https://github.com/pi/issues",
	},
	{ id: 13, title: "Issue 7", url: "https://github.com/pi/issues/7" },
	{ id: 14, title: "Docs", url: "https://pi.dev/docs" },
];

it("list 每行一个标签", async () => {
	const { run } = harness({ reply: () => ({ tabs: TABS }) });

	const result = await run("chrome_tab", { action: "list" });

	expect(textOf(result).split("\n")).toStrictEqual([
		"12 * Pi Issues https://github.com/pi/issues",
		"13 Issue 7 https://github.com/pi/issues/7",
		"14 Docs https://pi.dev/docs",
	]);
	expect(result.details?.tabs).toStrictEqual(TABS);
});

it("AC7: tab 命中两个时返回 tab_ambiguous 并列出两个候选", async () => {
	const { run } = harness({ reply: () => ({ tabs: TABS }) });

	const result = await run("chrome_tab", { action: "close", tab: "issues" });

	const lines = textOf(result).split("\n");
	expect(lines[0]).toBe('tab_ambiguous: tab "issues" matches 2 tabs');
	expect(lines[1]).toMatch(/^hint: /);
	expect(textOf(result)).toContain("12 * Pi Issues");
	expect(textOf(result)).toContain("13 Issue 7");
	expect(textOf(result)).not.toContain("14 Docs");
	expect(result.details?.error).toMatchObject({ class: "tab_ambiguous" });
});

it("AC8: 命中超过 5 个时只列 5 个并注明总数", async () => {
	const many = Array.from({ length: 8 }, (_, index) => ({
		id: index + 1,
		title: `Tab ${index + 1}`,
		url: "https://x",
	}));
	const { run } = harness({ reply: () => ({ tabs: many }) });

	const result = await run("chrome_tab", { action: "switch", tab: "x" });

	expect(textOf(result)).toContain("showing 5 of 8 candidates:");
	expect(textOf(result)).toContain("5 Tab 5");
	expect(textOf(result)).not.toContain("6 Tab 6");
});

it("tab 命中 0 个时返回 tab_not_found 与全部候选", async () => {
	const { run } = harness({ reply: () => ({ tabs: TABS }) });

	const result = await run("chrome_tab", { action: "close", tab: "nope" });

	expect(textOf(result).split("\n")[0]).toBe(
		'tab_not_found: no tab matches "nope"',
	);
	expect(result.details?.error).toMatchObject({ class: "tab_not_found" });
});

it("按 id 精确解析，switch 带 background: false", async () => {
	const { run, sent } = harness({ reply: () => ({ tabs: TABS }) });

	await run("chrome_tab", { action: "switch", tab: "14" });

	expect(sent.map((item) => item.action)).toStrictEqual([
		"tab.list",
		"tab.activate",
	]);
	expect(sent[1].params).toMatchObject({ tabId: 14, background: false });
});

it("AC15: new 成功后记下 target", async () => {
	const { run, sent, target } = harness({
		reply: () => ({ id: 21, url: "https://new", title: "", active: false }),
	});

	const result = await run("chrome_tab", { action: "new", url: "https://new" });

	expect(sent[0].params).toMatchObject({
		url: "https://new",
		background: true,
	});
	expect(target.get()).toBe(21);
	expect(textOf(result)).toBe("ok: new 21 https://new");
});

it("switch 缺 tab 时报 bad_args", async () => {
	const { run, sent } = harness();

	const result = await run("chrome_tab", { action: "switch" });

	expect(textOf(result).split("\n")[0]).toBe("bad_args: switch needs tab");
	expect(sent).toStrictEqual([]);
});
