import {
	stripTerminalSequences,
	truncateToWidth,
	visibleWidth,
	wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";
import type { Question } from "../src/schema.ts";
import type { Action, Session } from "../src/state.ts";
import { createSession, reduce } from "../src/state.ts";
import type { PanelStyle } from "../src/view.ts";
import {
	callLabels,
	expandedLines,
	renderPanel,
	resultLines,
	summarize,
} from "../src/view.ts";

const style: PanelStyle = {
	accent: (text) => text,
	muted: (text) => text,
	bold: (text) => text,
	width: (text) => visibleWidth(text),
	truncate: (text, width) => truncateToWidth(text, width, "…"),
	wrap: (text, width) => wrapTextWithAnsi(text, width),
	markdown: (text, width) =>
		text.split("\n").map((line) => truncateToWidth(line, width, "…")),
};

/** 带真 ANSI 的 style：颜色序列的存留本身就是要验的行为。 */
const colored: PanelStyle = {
	...style,
	accent: (text) => `\x1b[35m${text}\x1b[39m`,
	muted: (text) => `\x1b[2m${text}\x1b[22m`,
	bold: (text) => `\x1b[1m${text}\x1b[22m`,
};

const plain = (lines: string[]): string[] =>
	lines.map((line) => stripTerminalSequences(line));

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

const downs = (count: number): Action[] =>
	Array.from({ length: count }, () => ({ kind: "down" as const }));

const layout = {
	width: 100,
	height: 40,
	keys: { annotate: "e", submitEarly: "ctrl+enter", collapse: "ctrl+]" },
	showHints: true,
	minSideBySideWidth: 100,
};

describe("renderPanel", () => {
	it("顶部一条 dim 通栏分割线，其下 Tab、题干、选项与提示都贴第 0 列，单题不画 Tab 栏", () => {
		const session = createSession([question("Which one?", ["A", "B"])]);
		const lines = renderPanel(session, { ...layout, width: 60 }, colored);
		expect(lines[0]).toBe(`\x1b[2m${"─".repeat(60)}\x1b[22m`);
		const text = plain(lines);
		expect(text[1]).toBe("Which one?");
		expect(text[2]).toBe("› 1. A");
		expect(text.at(-1)).toBe(
			"enter pick · e note · ctrl+] collapse · esc abort",
		);
		expect(text.some((line) => line.includes("Q1"))).toBe(false);
	});

	it("题干永远完整折行显示，title 只做 Tab 标签", () => {
		const session = createSession([
			{
				question: "Which one?\r\nExtra context line",
				title: "MyTitle\nSecond",
				multiple: false,
				options: [{ label: "A\n隐藏的第二行" }, { label: "C" }],
			},
			question("Next question", ["D", "E"], { title: "Later" }),
		]);
		const lines = plain(renderPanel(session, { ...layout, width: 60 }, style));
		expect(lines).toContain("Which one?");
		expect(lines).toContain("Extra context line");
		expect(lines.some((line) => line.includes("1 MyTitle"))).toBe(true);
		expect(lines.some((line) => line.includes("2 Later"))).toBe(true);
		expect(lines.some((line) => line.includes("隐藏的第二行"))).toBe(false);
		expect(lines).toContain("› 1. A");
	});

	it("当前 Tab 用 accent 加粗加括号，其余 Tab 用 dim", () => {
		const session = apply(
			createSession([
				question("First", ["A", "B"], { title: "风格" }),
				question("Second", ["C", "D"], { title: "细节" }),
			]),
			{ kind: "nextQuestion" },
		);
		const tabs = renderPanel(session, layout, colored)[1];
		expect(tabs).toContain("\x1b[35m\x1b[1m[2 细节]");
		expect(tabs).toContain("\x1b[2m1 风格\x1b[22m");
	});

	it("已答的 Tab 段带 ✓", () => {
		const session = apply(
			createSession([
				question("First", ["A", "B"], { title: "First" }),
				question("Second", ["C", "D"], { title: "Second" }),
			]),
			{ kind: "confirm" },
		);
		const tabs = plain(renderPanel(session, layout, style))[1];
		expect(tabs).toContain("✓ 1 First");
		expect(tabs).toContain("2 Second");
	});

	it("单选用 › 与 ✓ 标记，不画 ○/●", () => {
		let session = createSession([
			question("One", ["A", "B"], { title: "One" }),
			question("Two", ["C", "D"], { title: "Two" }),
		]);
		session = apply(
			session,
			{ kind: "down" },
			{ kind: "confirm" },
			{ kind: "prevQuestion" },
		);
		const lines = plain(renderPanel(session, { ...layout, width: 60 }, style));
		expect(lines).toContain("› 1. A");
		expect(lines).toContain("✓ 2. B");
		expect(lines.join("\n")).not.toMatch(/[○●>]/);
	});

	it("多选用 ■/□ 标勾选，光标行带 ›", () => {
		const session = apply(
			createSession([question("Pick many", ["A", "B"], { multiple: true })]),
			{ kind: "confirm" },
		);
		const lines = plain(renderPanel(session, { ...layout, width: 60 }, style));
		expect(lines).toContain("› ■ 1. A");
		expect(lines).toContain("  □ 2. B");
	});

	it("多选末尾有 Confirm 行：平时 dim，聚焦高亮", () => {
		const session = createSession([
			question("Pick many", ["A", "B"], { multiple: true }),
		]);
		const idle = renderPanel(session, { ...layout, width: 60 }, colored);
		expect(idle.join("\n")).toContain("\x1b[2m  → Confirm\x1b[22m");

		const focused = apply(session, ...downs(3));
		expect(focused.focus).toEqual({ kind: "confirm" });
		const lines = renderPanel(focused, { ...layout, width: 60 }, colored);
		expect(lines.join("\n")).toContain("\x1b[35m› → Confirm");
	});

	it("Custom 未聚焦 dim，聚焦高亮", () => {
		const session = createSession([question("Q", ["A", "B"])]);
		const idle = plain(renderPanel(session, { ...layout, width: 60 }, style));
		expect(idle).toContain("  + Custom…");

		const focused = apply(session, ...downs(2));
		expect(focused.focus).toEqual({ kind: "custom" });
		expect(
			renderPanel(focused, { ...layout, width: 60 }, colored).join("\n"),
		).toContain("\x1b[35m› + Custom…");
	});

	it("detail 与已落地的 note 缩进到 label 列", () => {
		const session = apply(
			createSession([
				{
					question: "Pick",
					multiple: false,
					options: [{ label: "A", detail: "detail A" }, { label: "B" }],
				},
				question("Next", ["C", "D"]),
			]),
			{ kind: "annotate" },
			{ kind: "commitNote", text: "选 A" },
			{ kind: "prevQuestion" },
		);
		const lines = plain(renderPanel(session, { ...layout, width: 60 }, style));
		expect(lines).toContain("     detail A");
		expect(lines).toContain("     ↳ 选 A");
	});

	it("多选每个选项的 note 各自挂在它下面", () => {
		const session = apply(
			createSession([question("Pick", ["A", "B"], { multiple: true })]),
			{ kind: "annotate" },
			{ kind: "commitNote", text: "A 的理由" },
			{ kind: "down" },
			{ kind: "annotate" },
			{ kind: "commitNote", text: "B 的理由" },
		);
		const lines = plain(renderPanel(session, { ...layout, width: 60 }, style));
		expect(lines.indexOf("       ↳ A 的理由")).toBe(
			lines.indexOf("  ■ 1. A") + 1,
		);
		expect(lines.indexOf("       ↳ B 的理由")).toBe(
			lines.indexOf("› ■ 2. B") + 1,
		);
	});

	it("重新编辑已落地的 note 时只画输入行，不重复旧值", () => {
		const session = apply(
			createSession([question("Pick", ["A", "B"], { multiple: true })]),
			{ kind: "annotate" },
			{ kind: "commitNote", text: "旧理由" },
			{ kind: "annotate" },
		);
		const lines = plain(
			renderPanel(
				session,
				{ ...layout, width: 60, editorLines: () => ["新理由"] },
				style,
			),
		);
		expect(lines.filter((line) => line.includes("理由"))).toEqual([
			"       ↳ 新理由",
		]);
	});

	it("多选 note 就地编辑：输入行挂在该选项下方，焦点不跳走", () => {
		const session = apply(
			createSession([question("Pick", ["A", "B"], { multiple: true })]),
			{ kind: "down" },
			{ kind: "annotate" },
		);
		const lines = plain(
			renderPanel(
				session,
				{ ...layout, width: 60, editorLines: () => ["写 B 的理由"] },
				style,
			),
		);
		const option = lines.indexOf("› □ 2. B");
		expect(option).toBeGreaterThan(-1);
		expect(lines[option + 1]).toBe("       ↳ 写 B 的理由");
	});

	it("note 就地编辑：输入行紧跟该选项（detail 之后），不再有占行提示", () => {
		const session = apply(
			createSession([
				{
					question: "Pick",
					multiple: false,
					options: [{ label: "A" }, { label: "B", detail: "detail B" }],
				},
			]),
			{ kind: "down" },
			{ kind: "annotate" },
		);
		expect(session.phase).toMatchObject({ kind: "note", option: 1 });
		const lines = plain(
			renderPanel(
				session,
				{ ...layout, width: 60, editorLines: () => ["写了一半"] },
				style,
			),
		);
		const option = lines.indexOf("› 2. B");
		expect(option).toBeGreaterThan(-1);
		expect(lines[option + 1]).toBe("     detail B");
		expect(lines[option + 2]).toBe("     ↳ 写了一半");
		expect(lines.some((line) => line.includes("note for option"))).toBe(false);
	});

	it("编辑 note 时该选项保持高亮", () => {
		const session = apply(createSession([question("Pick", ["A", "B"])]), {
			kind: "annotate",
		});
		const lines = renderPanel(
			session,
			{ ...layout, width: 60, editorLines: () => ["x"] },
			colored,
		);
		expect(lines.join("\n")).toContain("\x1b[35m› 1. A");
	});

	it("custom 编辑：留着高亮的 › + Custom 行，输入行用 ▎ 竖条且没有边框", () => {
		const session = apply(
			createSession([question("Q", ["A", "B"])]),
			...downs(2),
			{ kind: "confirm" },
		);
		expect(session.phase).toEqual({ kind: "custom", initial: "" });
		const lines = plain(
			renderPanel(
				session,
				{
					...layout,
					width: 60,
					editorLines: () => ["第一行", "第二行"],
				},
				style,
			),
		);
		expect(lines).toContain("› + Custom");
		expect(lines).toContain("▎ 第一行");
		expect(lines).toContain("▎ 第二行");
		expect(lines.filter((line) => line.includes("─")).length).toBe(1);
	});

	it("并排时右栏从题干那一行就顶对齐，竖线 dim，不画 Preview 标头", () => {
		const session = createSession([
			{
				question: "Pick",
				multiple: false,
				options: [
					{ label: "A", preview: "line one\nline two" },
					{ label: "B" },
				],
			},
		]);
		const raw = renderPanel(
			session,
			{ ...layout, width: 120, minSideBySideWidth: 100 },
			colored,
		);
		const lines = plain(raw);
		// 左栏收到 12 列下限：8 格补齐 + 1 格留白，右栏在题干那行就开始画。
		expect(lines[1]).toBe(`Pick${" ".repeat(9)}│ line one`);
		expect(lines[2]).toBe(`› 1. A${" ".repeat(7)}│ line two`);
		expect(raw[1]).toContain("\x1b[2m│\x1b[22m");
		expect(lines.some((line) => line.includes("Preview"))).toBe(false);
		for (const line of raw) expect(visibleWidth(line)).toBeLessThanOrEqual(120);
	});

	it("并排时左栏宽度不超过 min(floor(width × 0.42), 54)", () => {
		const session = createSession([
			{
				question: "Pick",
				multiple: false,
				options: [{ label: "L".repeat(80), preview: "p" }, { label: "B" }],
			},
		]);
		const lines = plain(
			renderPanel(
				session,
				{ ...layout, width: 120, minSideBySideWidth: 100 },
				style,
			),
		);
		// 封顶 50 列：竖线落在第 51 列。
		expect(lines[1]?.indexOf("│")).toBe(51);
	});

	it("并排时不剥左栏颜色：选中项 accent，detail 保持 dim", () => {
		const session = createSession([
			{
				question: "Pick",
				multiple: false,
				options: [
					{ label: "Alpha", detail: "detail alpha", preview: "line one" },
					{ label: "Beta", detail: "detail beta" },
				],
			},
		]);
		const lines = renderPanel(
			session,
			{ ...layout, width: 120, minSideBySideWidth: 100 },
			colored,
		);
		const option = lines.find((line) => line.includes("1. Alpha"));
		expect(option).toContain("\x1b[35m› 1. Alpha");
		const detail = lines.find((line) => line.includes("detail alpha"));
		expect(detail).toContain("\x1b[2m");
		for (const line of lines)
			expect(visibleWidth(line)).toBeLessThanOrEqual(120);
	});

	it("detail 高度充裕时最多折 2 行，多出的用 … 收尾", () => {
		const session = createSession([
			{
				question: "Pick",
				multiple: false,
				options: [{ label: "A", detail: "detail ".repeat(20) }, { label: "B" }],
			},
		]);
		const lines = plain(
			renderPanel(session, { ...layout, width: 40, height: 20 }, style),
		);
		const detailLines = lines.filter((line) =>
			line.trimStart().startsWith("detail"),
		);
		expect(detailLines).toHaveLength(2);
		expect(detailLines[1]?.endsWith("…")).toBe(true);
		for (const line of lines)
			expect(visibleWidth(line)).toBeLessThanOrEqual(40);
	});

	it("窄屏把 preview 堆叠在选项下方", () => {
		const session = createSession([
			{
				question: "Pick",
				multiple: false,
				options: [
					{ label: "A", preview: "line one\nline two" },
					{ label: "B" },
				],
			},
		]);
		const lines = plain(
			renderPanel(
				session,
				{ ...layout, width: 80, minSideBySideWidth: 100 },
				style,
			),
		);
		expect(lines.some((line) => line.includes("│"))).toBe(false);
		expect(lines.some((line) => line.includes("Preview"))).toBe(false);
		expect(lines).toContain("line two");
	});

	it("超预算先裁 detail，行数不超过高度，提示行留在最后", () => {
		const labels = ["A", "B", "C", "D", "E", "F"];
		const long = question("Pick", labels, {
			options: labels.map((label) => ({ label, detail: `detail of ${label}` })),
		});
		const lines = renderPanel(
			createSession([long]),
			{ ...layout, width: 80, height: 10 },
			style,
		);
		expect(lines.length).toBeLessThanOrEqual(10);
		expect(lines.at(-1)).toContain("esc");
		expect(lines.some((line) => line.includes("detail of"))).toBe(false);
	});

	it("堆叠时先裁 preview，detail 与选项都留着", () => {
		const session = createSession([
			{
				question: "Pick",
				multiple: false,
				options: [
					{
						label: "A",
						detail: "detail A",
						preview: "p1\np2\np3\np4\np5\np6",
					},
					{ label: "B" },
				],
			},
		]);
		const lines = renderPanel(
			session,
			{ ...layout, width: 80, height: 12 },
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
		expect(lines.filter((line) => /│ p\d/.test(line)).length).toBe(3);
	});

	it("选项多时收成围绕焦点的窗口，Custom 与 Confirm 留着", () => {
		let session = createSession([
			question("Pick", ["A", "B", "C", "D", "E", "F", "G", "H"], {
				multiple: true,
			}),
		]);
		session = apply(session, ...downs(6));
		expect(session.focus).toEqual({ kind: "option", index: 6 });
		const lines = plain(
			renderPanel(session, { ...layout, width: 80, height: 8 }, style),
		);
		expect(
			lines.some(
				(line) => line.includes("7. G") && line.trim().startsWith("›"),
			),
		).toBe(true);
		expect(lines.some((line) => line.includes("1. A"))).toBe(false);
		expect(lines).toContain("  + Custom…");
		expect(lines).toContain("  → Confirm");
	});

	it("note 编辑时输入行不会被裁掉", () => {
		const session = apply(
			createSession([
				{
					question: "Pick",
					multiple: false,
					options: ["A", "B", "C", "D", "E", "F"].map((label) => ({
						label,
						detail: `detail of ${label}`,
					})),
				},
			]),
			...downs(5),
			{ kind: "annotate" },
		);
		const lines = plain(
			renderPanel(
				session,
				{ ...layout, width: 80, height: 8, editorLines: () => ["在写"] },
				style,
			),
		);
		expect(lines).toContain("     ↳ 在写");
		expect(lines.some((line) => line.includes("detail of"))).toBe(false);
	});

	it("单题单选的键提示只列真能用的键", () => {
		const lines = renderPanel(
			createSession([question("Q", ["A", "B"])]),
			{ ...layout, width: 80 },
			style,
		);
		expect(lines.at(-1)).toBe(
			"enter pick · e note · ctrl+] collapse · esc abort",
		);
	});

	it("showHints 为 false 时不画提示行，正文多留一行", () => {
		const session = createSession([question("Q", ["A", "B", "C"])]);
		const shown = renderPanel(session, { ...layout, width: 80 }, style);
		const hidden = renderPanel(
			session,
			{ ...layout, width: 80, showHints: false },
			style,
		);
		expect(shown.at(-1)).toContain("esc");
		expect(hidden.some((line) => line.includes("esc"))).toBe(false);
		expect(hidden.length).toBe(shown.length - 1);
		expect(hidden.at(-1)).toBe("  + Custom…");
	});

	it("collapse 配成 off 时提示不提折叠", () => {
		const lines = renderPanel(
			createSession([question("Q", ["A", "B"])]),
			{ ...layout, width: 80, keys: { ...layout.keys, collapse: undefined } },
			style,
		);
		expect(lines.at(-1)).toBe("enter pick · e note · esc abort");
	});

	it("折叠后只剩一行：已答进度与展开键", () => {
		const session = apply(
			createSession([
				question("First", ["A", "B"]),
				question("Second", ["C", "D"]),
			]),
			{ kind: "confirm" },
			{ kind: "toggleCollapse" },
		);
		const lines = renderPanel(session, { ...layout, width: 80 }, colored);
		expect(lines).toHaveLength(1);
		expect(stripTerminalSequences(lines[0] ?? "")).toBe(
			"Ask collapsed (1/2) · ctrl+] expand",
		);
		expect(lines[0]).toContain("\x1b[2m");
	});

	it("折叠再展开，题目、答案与草稿原样回来", () => {
		let session = apply(
			createSession([question("First", ["A", "B"], { title: "One" })]),
			{ kind: "annotate" },
			{ kind: "cancelNote", text: "草稿" },
		);
		const before = renderPanel(session, { ...layout, width: 80 }, style);
		session = apply(session, { kind: "toggleCollapse" });
		expect(renderPanel(session, { ...layout, width: 80 }, style)).toHaveLength(
			1,
		);
		session = apply(session, { kind: "toggleCollapse" });
		expect(renderPanel(session, { ...layout, width: 80 }, style)).toEqual(
			before,
		);
	});

	it("多题单选的键提示补上切题与提前提交", () => {
		const lines = renderPanel(
			createSession([
				question("First", ["A", "B"]),
				question("Second", ["C", "D"]),
			]),
			{ ...layout, width: 80 },
			style,
		);
		expect(lines.at(-1)).toBe(
			"enter pick · e note · tab next · ctrl+enter submit · ctrl+] collapse · esc abort",
		);
	});

	it("多选题的提示是 enter toggle 加 e note，单题省略 tab next", () => {
		const one = renderPanel(
			createSession([question("Q", ["A", "B"], { multiple: true })]),
			{ ...layout, width: 80 },
			style,
		);
		expect(one.at(-1)).toBe(
			"enter toggle · e note · ctrl+enter submit · ctrl+] collapse · esc abort",
		);

		const two = renderPanel(
			createSession([
				question("First", ["A", "B"], { multiple: true }),
				question("Second", ["C", "D"]),
			]),
			{ ...layout, width: 120 },
			style,
		);
		expect(two.at(-1)).toBe(
			"enter toggle · e note · tab next · ctrl+enter submit · ctrl+] collapse · esc abort",
		);
	});

	it("键提示随 list / note / custom 换", () => {
		const note = renderPanel(
			apply(createSession([question("Q", ["A", "B"])]), { kind: "annotate" }),
			{ ...layout, width: 80 },
			style,
		);
		expect(note.at(-1)).toBe("enter save · esc back");

		const custom = renderPanel(
			apply(createSession([question("Q", ["A", "B"])]), ...downs(2), {
				kind: "confirm",
			}),
			{ ...layout, width: 80 },
			style,
		);
		expect(custom.at(-1)).toBe("enter save · shift+enter newline · esc back");
	});

	it("超宽文本截断出 …", () => {
		const session = createSession([
			question("Q".repeat(80), ["L".repeat(80), "B"]),
		]);
		const lines = renderPanel(session, { ...layout, width: 40 }, style);
		expect(lines.some((line) => line.includes("…"))).toBe(true);
		for (const line of lines)
			expect(visibleWidth(line)).toBeLessThanOrEqual(40);
	});

	it("AC4：宽度 80/100/120 × 高度 6/20/40 都守宽度、行数与单行约束", () => {
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
			for (const height of [6, 20, 40]) {
				const lines = renderPanel(session, { ...layout, width, height }, style);
				expect(lines.length).toBeLessThanOrEqual(height);
				expect(lines.at(-1)).toContain("esc");
				for (const line of lines) {
					expect(line).not.toContain("\n");
					expect(visibleWidth(line)).toBeLessThanOrEqual(width);
				}
			}
		}
	});

	it("窄宽度下任何行都不超宽（含 8 列）", () => {
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

	it("custom 编辑多行时留尾部：光标行与竖条都在，头部先裁", () => {
		const session = apply(
			createSession([question("Q", ["A", "B"])]),
			...downs(2),
			{ kind: "confirm" },
		);
		const editorLines = Array.from(
			{ length: 8 },
			(_, index) => `line ${index + 1}`,
		);
		const lines = renderPanel(
			session,
			{ ...layout, width: 80, height: 8, editorLines: () => editorLines },
			style,
		);
		expect(lines.length).toBeLessThanOrEqual(8);
		expect(lines.at(-1)).toContain("esc back");
		expect(lines).toContain("▎ line 8");
		expect(lines).not.toContain("▎ line 1");
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

describe("聊天记录", () => {
	it("调用行用 title，缺省取 question 首行", () => {
		expect(
			callLabels([
				{ question: "Which one?", title: "风格", options: [] },
				{ question: "细节？\n第二行", options: [] },
			]),
		).toBe("风格 · 细节？");
	});

	it("结果每题一行，custom 与 note 跟着答案走", () => {
		const questions = [
			{ question: "First", title: "One", options: [{ label: "A" }] },
			{ question: "Second", options: [{ label: "B" }] },
		];
		const lines = resultLines(
			{
				aborted: false,
				answers: [
					{
						index: 0,
						question: "First",
						selected: [0],
						note: "理由",
					},
					{
						index: 1,
						question: "Second",
						selected: [],
						custom: "自由文本",
					},
				],
			},
			questions,
		);
		expect(lines).toEqual([
			{ text: "✓ One: A (note: 理由)", kind: "answer" },
			{ text: "✓ Second: custom: 自由文本", kind: "answer" },
		]);
	});

	it("多选的 note 跟在各自选项名后", () => {
		const lines = resultLines(
			{
				aborted: false,
				answers: [
					{
						index: 0,
						question: "Many",
						selected: [0, 2],
						notes: { "0": "A 的理由", "2": "C 的理由" },
					},
				],
			},
			[
				{
					question: "Many",
					options: [{ label: "A" }, { label: "B" }, { label: "C" }],
				},
			],
		);
		expect(lines).toEqual([
			{
				text: "✓ Many: A (note: A 的理由) · C (note: C 的理由)",
				kind: "answer",
			},
		]);
	});

	it("展开态给出完整题干、选中项与 note，跳过项也带题干", () => {
		const questions = [
			{
				title: "One",
				question: "First\nsecond line",
				options: [{ label: "A" }, { label: "B" }],
			},
			{ question: "Second", options: [{ label: "C" }] },
		];
		const lines = expandedLines(
			{
				aborted: false,
				answers: [
					{
						index: 0,
						question: "First\nsecond line",
						selected: [0, 1],
						notes: { "0": "理由 A" },
					},
				],
				skipped: [1],
			},
			questions,
		);
		expect(lines).toEqual([
			{
				text: [
					"✓ One",
					"  First",
					"  second line",
					"  - A (note: 理由 A)",
					"  - B",
				].join("\n"),
				kind: "answer",
			},
			{ text: "Second: skipped", kind: "skipped" },
		]);
	});

	it("展开态带上 custom，中止仍只有一行", () => {
		const lines = expandedLines(
			{
				aborted: false,
				answers: [
					{ index: 0, question: "Q", selected: [], custom: "自由文本" },
				],
			},
			[{ title: "Q", question: "问题", options: [{ label: "A" }] }],
		);
		expect(lines).toEqual([
			{
				text: ["✓ Q", "  问题", "  custom: 自由文本"].join("\n"),
				kind: "answer",
			},
		]);
		expect(expandedLines({ aborted: true, answers: [] }, [])).toEqual([
			{ text: "✗ aborted", kind: "aborted" },
		]);
	});

	it("跳过的题 dim 标 skipped，中止只有一行", () => {
		expect(
			resultLines({ aborted: false, answers: [], skipped: [0] }, [
				{ question: "First", title: "One", options: [] },
			]),
		).toEqual([{ text: "One: skipped", kind: "skipped" }]);
		expect(resultLines({ aborted: true, answers: [] }, [])).toEqual([
			{ text: "✗ aborted", kind: "aborted" },
		]);
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
			{ kind: "annotate" },
			{ kind: "commitNote", text: "C 的理由" },
			...downs(2),
			{ kind: "confirm" },
			{ kind: "commitCustom", text: "再加一条" },
		);
		const phase = session.phase;
		if (phase.kind !== "done") throw new Error("expected done");
		const text = summarize(phase.outcome, questions);
		expect(text).toContain("1. Pick one => B (note: 选 B)");
		expect(text).toContain("2. Many => C (note: C 的理由) | custom: 再加一条");
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
