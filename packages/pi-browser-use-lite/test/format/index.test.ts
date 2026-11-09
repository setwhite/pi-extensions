import { expect, it } from "vitest";
import {
	candidatesText,
	changedLine,
	errorText,
	openedLine,
	savedText,
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

it("AC9: 新开的标签单独一行；只有一个时并进首行", () => {
	expect(
		openedLine([{ id: 8, active: true, title: "黑猫道", url: "https://s" }]),
	).toBe("opened: +1 8 * 黑猫道 https://s");
	expect(
		openedLine([
			{ id: 8, title: "A", url: "https://a" },
			{ id: 9, title: "B", url: "https://b" },
		]),
	).toBe("opened: +2\n  8 A https://a\n  9 B https://b");
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
