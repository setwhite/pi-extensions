import { expect, it } from "vitest";
import {
	candidatesText,
	cdpText,
	changedLine,
	errorText,
	evalText,
	limitElements,
	openedLine,
	savedText,
	snapshotText,
	tabsText,
	valueText,
} from "../../src/format/index.ts";

it("AC12: 错误文本是固定两行", () => {
	expect(
		errorText({ class: "bad_args", message: "missing ref", hint: "add ref" }),
	).toBe("bad_args: missing ref\nhint: add ref");
});

it("AC12: 没有下一步时只留第一行", () => {
	expect(errorText({ class: "aborted", message: "cancelled", hint: "" })).toBe(
		"aborted: cancelled",
	);
});

it("变更量是三元组的计数", () => {
	expect(changedLine({ added: 1, removed: 0, updated: 2 })).toBe(
		"changed: +1 -0 ~2",
	);
});

it("AC9: 新开的标签单独一行，并给出下一轮的 tab id", () => {
	// 不带 id 时模型会为了拿 id 再调一次 chrome_tab list。
	expect(
		openedLine([{ id: 8, active: true, title: "黑猫道", url: "https://s" }]),
	).toBe("opened: +1 8 * 黑猫道 https://s (next: tab=8)");
	expect(
		openedLine([
			{ id: 8, title: "A", url: "https://a" },
			{ id: 9, title: "B", url: "https://b" },
		]),
	).toBe("opened: +2 (next: tab=<id>)\n  8 A https://a\n  9 B https://b");
});

it("evalText 超限时截断并报出丢弃的字数", () => {
	expect(evalText("short", 10)).toStrictEqual({
		text: "short",
		truncated: false,
	});
	const clipped = evalText("abcdefghij", 4);
	expect(clipped.truncated).toBe(true);
	expect(
		clipped.text.startsWith(
			"abcd\n[eval output cut at 4 characters: 6 more dropped;",
		),
	).toBe(true);
});

it("evalText 遇到 JSON 按结构剪，预览仍是合法 JSON", () => {
	const value = {
		items: Array.from({ length: 40 }, (_, index) => ({
			id: index,
			name: `item ${index}`,
		})),
	};
	const limit = 300;
	const cut = evalText(value, limit);
	expect(cut.truncated).toBe(true);
	expect(cut.text.length).toBeLessThanOrEqual(limit);
	const parsed = JSON.parse(cut.text) as { items: unknown[] };
	expect(Array.isArray(parsed.items)).toBe(true);
	expect(cut.text).toContain("more dropped");
});

it("evalText 遇到 JSON 字符串也按结构剪", () => {
	const cut = evalText(
		JSON.stringify(Array.from({ length: 50 }, (_, i) => i)),
		120,
	);
	expect(cut.truncated).toBe(true);
	expect(Array.isArray(JSON.parse(cut.text))).toBe(true);
	expect(cut.text.length).toBeLessThanOrEqual(120);
});

it("evalText 剪不动结构时退回按字符切", () => {
	const cut = evalText("x".repeat(50), 10);
	expect(cut.truncated).toBe(true);
	expect(
		cut.text.startsWith("xxxxxxxxxx\n[eval output cut at 10 characters"),
	).toBe(true);
});

it("cdpText 与 evalText 同一条剪法，尾巴指向 CDP 的下一步", () => {
	const cut = cdpText(
		{ rows: Array.from({ length: 30 }, (_, i) => `row-${i}`.repeat(4)) },
		200,
	);
	expect(cut.truncated).toBe(true);
	expect(cut.text.length).toBeLessThanOrEqual(200);
	expect(
		Array.isArray((JSON.parse(cut.text) as { rows: unknown[] }).rows),
	).toBe(true);
	const plain = cdpText("y".repeat(50), 10);
	expect(plain.text).toContain(
		"[cdp output cut at 10 characters: 40 more dropped;",
	);
});

it("limitElements 按渲染后的行长度裁，整块不超过预算", () => {
	const elements = Array.from({ length: 12 }, (_, index) => ({
		ref: `e${index + 1}`,
		tag: "button",
		name: `按钮 ${index}`,
		text: "x".repeat(30),
	}));
	const budget = 300;

	const limited = limitElements(elements, budget);
	const text = snapshotText({ mode: "refs", elements: limited.elements });

	expect(limited.elements.length).toBeGreaterThan(0);
	expect(limited.elements.length).toBeLessThan(elements.length);
	expect(limited.omitted).toBe(elements.length - limited.elements.length);
	expect(text.length).toBeLessThanOrEqual(budget);
});

it("limitElements 预算再紧也留一条，不把清单清空", () => {
	const limited = limitElements(
		[{ ref: "e1", tag: "button", name: "x".repeat(500) }],
		10,
	);

	expect(limited.elements).toHaveLength(1);
	expect(limited.omitted).toBe(0);
});

it("limitElements 预算够时一条不少", () => {
	const elements = [{ ref: "e1", tag: "button", name: "Go" }];

	expect(limitElements(elements, 8_000)).toStrictEqual({
		elements,
		omitted: 0,
	});
});

it("AC11: 空标签列表回一句明文，不回空字符串", () => {
	// 空输出会被模型读成「工具没给结果」，接着猜「没有浏览器会话」。
	expect(tabsText([])).toBe("no tabs in this session yet");
});

it("AC11: 同一份输入产出同一段文本", () => {
	const tabs = [{ id: 12, active: true, title: "Issues", url: "https://x" }];
	expect(tabsText(tabs)).toBe(tabsText(tabs));
});

it("值转文本：字符串原样，其余 JSON", () => {
	expect(valueText("hello")).toBe("hello");
	expect(valueText({ a: [1, 2] })).toBe('{"a":[1,2]}');
	expect(valueText(undefined)).toBe("null");
	expect(valueText(null)).toBe("null");
	expect(valueText(42)).toBe("42");
});

it("标签页清单每行一个标签，活动页带星号", () => {
	const text = tabsText([
		{ id: 12, active: true, title: "Issues", url: "https://a" },
		{ id: 7, title: "Docs", url: "https://b" },
	]);

	expect(text.split("\n")).toStrictEqual([
		"12 * Issues https://a",
		"7 Docs https://b",
	]);
});

it("AC8: 候选只列 5 个并注明总数", () => {
	const tabs = Array.from({ length: 7 }, (_, index) => ({
		id: index + 1,
		title: `T${index + 1}`,
		url: `https://${index + 1}`,
	}));

	const text = candidatesText(tabs);

	expect(text.split("\n")).toHaveLength(6);
	expect(text).toContain("showing 5 of 7");
	expect(text).toContain("1 T1 https://1");
	expect(text).not.toContain("6 T6");
});

it("候选不超过上限时不注明总数", () => {
	const text = candidatesText([
		{ id: 1, title: "A", url: "https://a" },
		{ id: 2, title: "B", url: "https://b" },
	]);

	expect(text.split("\n")).toHaveLength(2);
	expect(text).not.toContain("showing");
});

it("截图每个文件一行", () => {
	expect(savedText(["/tmp/a.png", "/tmp/b.png"])).toBe(
		"Saved /tmp/a.png\nSaved /tmp/b.png",
	);
});
