import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";
import type { Question } from "../src/schema.ts";
import type { Action, Session } from "../src/state.ts";
import { createSession, reduce } from "../src/state.ts";
import type { PanelStyle } from "../src/view.ts";
import { renderPanel, summarize } from "../src/view.ts";

const style: PanelStyle = {
	accent: (text) => text,
	muted: (text) => text,
	bold: (text) => text,
	width: (text) => visibleWidth(text),
	truncate: (text, width) => truncateToWidth(text, width, "…"),
	markdown: (text, width) =>
		text.split("\n").map((line) => truncateToWidth(line, width, "…")),
};

function question(
	text: string,
	labels: string[],
	extra: Partial<Question> = {},
): Question {
	return {
		question: text,
		multiple: false,
		options: labels.map((label) => ({ label })),
		...extra,
	};
}

function apply(session: Session, ...actions: Action[]): Session {
	return actions.reduce(reduce, session);
}

const layout = {
	width: 100,
	height: 40,
	keys: { annotate: "e", submitEarly: "ctrl+enter" },
	minSideBySideWidth: 100,
};

describe("renderPanel", () => {
	it("单题不画 Tab 栏，第一行就是题干", () => {
		const session = createSession([question("Which one?", ["A", "B"])]);
		const lines = renderPanel(session, { ...layout, width: 60 }, style);
		expect(lines[0]).toBe("Which one?");
		expect(lines.join("\n")).not.toMatch(/^1 /m);
	});

	it("多选题画 Tab 栏，已答的段带对勾", () => {
		let session = createSession([
			question("First", ["A", "B"]),
			question("Second", ["C", "D"]),
		]);
		session = apply(session, { kind: "confirm" });
		const lines = renderPanel(session, layout, style);
		expect(lines[0]).toContain("✓ 1 First");
		expect(lines[0]).toContain("2 Second");
	});

	it("选项带数字前缀，多选勾选显示 ✓，焦点行带 › ", () => {
		let session = createSession([
			question("Pick many", ["A", "B"], { multiple: true }),
		]);
		session = apply(session, { kind: "toggle" });
		const lines = renderPanel(session, { ...layout, width: 60 }, style);
		expect(lines.some((line) => line.startsWith("› ✓ 1. A"))).toBe(true);
		expect(lines.some((line) => line.endsWith("2. B"))).toBe(true);
	});

	it("custom 行显示已输入文本与草稿", () => {
		let session = createSession([question("Q", ["A", "B"])]);
		session = apply(
			session,
			{ kind: "down" },
			{ kind: "down" },
			{ kind: "confirm" },
			{ kind: "cancelCustom", text: "写了一半" },
		);
		const lines = renderPanel(session, { ...layout, width: 60 }, style);
		expect(lines.some((line) => line.includes("Custom: 写了一半"))).toBe(true);
	});

	it("宽屏并排 preview，窄屏堆叠", () => {
		const session = createSession([
			question("Pick", ["A", "B"], {
				options: [
					{ label: "A", preview: "line one\nline two" },
					{ label: "B" },
				],
			}),
		]);
		const wide = renderPanel(
			session,
			{ ...layout, width: 120, minSideBySideWidth: 100 },
			style,
		);
		expect(
			wide.some((line) => line.includes("│") && line.includes("line one")),
		).toBe(true);
		const narrow = renderPanel(
			session,
			{ ...layout, width: 80, minSideBySideWidth: 100 },
			style,
		);
		expect(narrow.some((line) => line.includes("│"))).toBe(false);
		expect(narrow.some((line) => line.trim() === "line two")).toBe(true);
	});

	it("超预算先裁 detail，行数不超过高度，提示行留在最后", () => {
		const long = question("Pick", ["A", "B", "C", "D", "E", "F"], {
			options: ["A", "B", "C", "D", "E", "F"].map((label) => ({
				label,
				detail: `detail of ${label}`,
			})),
		});
		const session = createSession([long]);
		const lines = renderPanel(
			session,
			{ ...layout, width: 80, height: 10 },
			style,
		);
		expect(lines.length).toBeLessThanOrEqual(10);
		expect(lines.at(-1)).toContain("esc abort");
		expect(lines.some((line) => line.includes("detail of"))).toBe(false);
	});

	it("标题优先 title，缺省用 question 首行，行里不带换行", () => {
		const titled = createSession([
			{
				question: "Which one?\r\nExtra context",
				title: "MyTitle\nSecond",
				multiple: false,
				options: [{ label: "A\nB" }, { label: "C" }],
			},
		]);
		const lines = renderPanel(titled, { ...layout, width: 80 }, style);
		expect(lines[0]).toBe("MyTitle");
		expect(lines.every((line) => !line.includes("\n"))).toBe(true);
		expect(lines.some((line) => line.includes("1. A"))).toBe(true);
		expect(lines.some((line) => line.includes("B"))).toBe(false);

		const untitled = createSession([
			question("Which one?\nExtra context", ["A", "B"]),
		]);
		const fallback = renderPanel(untitled, { ...layout, width: 80 }, style);
		expect(fallback[0]).toBe("Which one?");
	});

	it("custom 编辑多行时留尾部：光标行与下边框都在，头部先裁", () => {
		const session = apply(
			createSession([question("Q", ["A", "B"])]),
			{ kind: "down" },
			{ kind: "down" },
			{ kind: "confirm" },
		);
		const editorLines = [
			"┌────────┐",
			..."12345678".split("").map((tag) => `│ line ${tag} │`),
			"└────────┘",
		];
		const lines = renderPanel(
			session,
			{ ...layout, width: 80, height: 10, editorLines },
			style,
		);
		expect(lines.length).toBeLessThanOrEqual(10);
		expect(lines.at(-1)).toContain("esc back");
		expect(lines.some((line) => line.includes("│ line 8 │"))).toBe(true);
		expect(lines.some((line) => line.includes("└────────┘"))).toBe(true);
		expect(lines.some((line) => line.includes("│ line 1 │"))).toBe(false);
	});

	it("堆叠时先裁 preview，detail 与选项都留着", () => {
		const session = createSession([
			{
				question: "Pick",
				multiple: false,
				options: [
					{ label: "A", detail: "detail A", preview: "p1\np2\np3\np4\np5\np6" },
					{ label: "B" },
				],
			},
		]);
		const lines = renderPanel(
			session,
			{ ...layout, width: 80, height: 8 },
			style,
		);
		expect(lines.some((line) => line.includes("detail A"))).toBe(true);
		expect(lines.some((line) => line.includes("p2"))).toBe(true);
		expect(lines.some((line) => line.includes("p6"))).toBe(false);
	});

	it("并排时两栏各自裁：左栏去 detail，右栏只留预算内的 preview", () => {
		const session = createSession([
			{
				question: "Pick",
				multiple: false,
				options: [
					{
						label: "Alpha",
						detail: "detail alpha",
						preview: "p1\np2\np3\np4\np5",
					},
					{ label: "Beta", detail: "detail beta" },
				],
			},
		]);
		const lines = renderPanel(
			session,
			{ ...layout, width: 120, height: 6 },
			style,
		);
		expect(lines.length).toBeLessThanOrEqual(6);
		expect(lines.some((line) => line.includes("1. Alpha"))).toBe(true);
		expect(lines.some((line) => line.includes("detail"))).toBe(false);
		expect(lines.some((line) => line.includes("p1"))).toBe(true);
		expect(lines.some((line) => line.includes("p5"))).toBe(false);
		expect(
			lines.filter((line) => line.includes("│") && line.includes("p")).length,
		).toBe(4);
	});

	it("选项多时收成围绕焦点的窗口，Custom 行留着", () => {
		let session = createSession([
			question("Pick", ["A", "B", "C", "D", "E", "F", "G", "H"]),
		]);
		session = apply(
			session,
			...Array.from({ length: 6 }, () => ({ kind: "down" as const })),
		);
		expect(session.focus).toEqual({ kind: "option", index: 6 });
		const lines = renderPanel(
			session,
			{ ...layout, width: 80, height: 8 },
			style,
		);
		expect(
			lines.some((line) => line.includes("7. G") && line.startsWith("›")),
		).toBe(true);
		expect(lines.some((line) => line.includes("1. A"))).toBe(false);
		expect(lines.some((line) => line.includes("Custom…"))).toBe(true);
	});

	it("键提示随 list / note / custom 换", () => {
		const list = renderPanel(
			createSession([question("Q", ["A", "B"])]),
			{ ...layout, width: 80 },
			style,
		);
		expect(list.at(-1)).toContain("esc abort");

		const note = renderPanel(
			apply(createSession([question("Q", ["A", "B"])]), { kind: "annotate" }),
			{ ...layout, width: 80 },
			style,
		);
		expect(note.at(-1)).toBe("enter save · esc back");

		const custom = renderPanel(
			apply(
				createSession([question("Q", ["A", "B"])]),
				{ kind: "down" },
				{ kind: "down" },
				{ kind: "confirm" },
			),
			{ ...layout, width: 80 },
			style,
		);
		expect(custom.at(-1)).toContain("shift+enter newline");
	});

	it("超宽文本截断出 …", () => {
		const session = createSession([
			question("Q".repeat(80), ["L".repeat(80), "B"]),
		]);
		const lines = renderPanel(session, { ...layout, width: 40 }, style);
		expect(lines[0]).toContain("…");
		expect(lines.some((line) => line.includes("…"))).toBe(true);
		for (const line of lines)
			expect(visibleWidth(line)).toBeLessThanOrEqual(40);
	});

	it("AC4：宽度 80/100/120 × 高度 20/40 都守宽度、行数与单行约束", () => {
		const session = apply(
			createSession([
				question("First", ["A", "B"]),
				{
					question: "Second\nwith a newline",
					multiple: true,
					options: Array.from({ length: 6 }, (_, index) => ({
						label: `选项 ${index + 1} ${"长".repeat(20)}`,
						detail: index === 0 ? "detail\nline" : undefined,
						preview: index === 0 ? "preview\nline\nmore" : undefined,
					})),
				},
			]),
			{ kind: "nextQuestion" },
		);
		for (const width of [80, 100, 120]) {
			for (const height of [20, 40]) {
				const lines = renderPanel(session, { ...layout, width, height }, style);
				expect(lines.length).toBeLessThanOrEqual(height);
				expect(lines.at(-1)).toContain("esc abort");
				for (const line of lines) {
					expect(line).not.toContain("\n");
					expect(visibleWidth(line)).toBeLessThanOrEqual(width);
				}
			}
		}
	});

	it("窄宽度下任何行都不超宽（含 8 列并排）", () => {
		const session = createSession([
			{
				question: "Pick",
				multiple: false,
				options: [
					{ label: "A", detail: "detail", preview: "hello world\nsecond" },
					{ label: "B" },
				],
			},
		]);
		for (const width of [1, 2, 5, 8, 12, 13, 40]) {
			for (const minSideBySideWidth of [0, 100]) {
				for (const line of renderPanel(
					session,
					{ ...layout, width, height: 20, minSideBySideWidth },
					style,
				)) {
					expect(visibleWidth(line)).toBeLessThanOrEqual(width);
				}
			}
		}
	});

	it("note 编辑态把编辑行挂在选项下方", () => {
		let session = createSession([
			question("First", ["A", "B"]),
			question("Second", ["C", "D"]),
		]);
		session = apply(session, { kind: "annotate" });
		const lines = renderPanel(
			session,
			{ ...layout, width: 80, editorLines: ["  [note input]"] },
			style,
		);
		expect(lines.some((line) => line.includes("note for option 1"))).toBe(true);
		expect(lines.some((line) => line.includes("[note input]"))).toBe(true);
	});

	it("每行都不超过终端宽度", () => {
		const session = createSession([
			question("很长的题干".repeat(20), ["选项一".repeat(20), "B"], {
				options: [
					{ label: "选项一".repeat(20), preview: "预览".repeat(60) },
					{ label: "B" },
				],
			}),
		]);
		for (const width of [40, 80, 120]) {
			for (const line of renderPanel(
				session,
				{ ...layout, width, height: 40 },
				style,
			)) {
				expect(visibleWidth(line)).toBeLessThanOrEqual(width);
			}
		}
	});
});

describe("summarize", () => {
	it("写出题号、标签、custom 与 note", () => {
		const questions = [
			question("Pick one", ["A", "B"]),
			question("Many", ["C", "D"], { multiple: true }),
		];
		let session = createSession(questions);
		session = apply(
			session,
			{ kind: "down" },
			{ kind: "annotate" },
			{ kind: "commitNote", text: "选 B" },
			{ kind: "toggle" },
			{ kind: "down" },
			{ kind: "down" },
			{ kind: "confirm" },
			{ kind: "down" },
			{ kind: "down" },
			{ kind: "confirm" },
			{ kind: "commitCustom", text: "再加一条" },
		);
		const phase = session.phase;
		if (phase.kind !== "done") throw new Error("expected done");
		const text = summarize(phase.outcome, questions);
		expect(text).toContain("1. Pick one => B | note: 选 B");
		expect(text).toContain("2. Many => C | custom: 再加一条");
	});

	it("提前提交写出 skipped 题号", () => {
		const questions = [
			question("First", ["A", "B"]),
			question("Second", ["C", "D"]),
		];
		const session = apply(
			createSession(questions),
			{ kind: "confirm" },
			{ kind: "submitEarly" },
		);
		const phase = session.phase;
		if (phase.kind !== "done") throw new Error("expected done");
		expect(summarize(phase.outcome, questions)).toContain(
			"Skipped questions: 2.",
		);
	});

	it("中止时说明不要重问", () => {
		const session = apply(createSession([question("Q", ["A", "B"])]), {
			kind: "escape",
		});
		const phase = session.phase;
		if (phase.kind !== "done") throw new Error("expected done");
		expect(summarize(phase.outcome, [question("Q", ["A", "B"])])).toMatch(
			/aborted.*Do not repeat/,
		);
	});
});
