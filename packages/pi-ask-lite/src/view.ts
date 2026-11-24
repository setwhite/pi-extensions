import type { Question } from "./schema.ts";
import type { Outcome, Session } from "./state.ts";

export type PanelStyle = {
	accent(text: string): string;
	muted(text: string): string;
	bold(text: string): string;
	width(text: string): number;
	truncate(text: string, width: number): string;
	markdown(text: string, width: number): string[];
};

export type PanelLayout = {
	width: number;
	height: number;
	keys: { annotate: string; submitEarly: string };
	minSideBySideWidth: number;
	/** 编辑态由 index.ts 渲染：custom 替换 Custom 行，note 挂在选项下方。 */
	editorLines?: string[];
};

type Row = {
	text: string;
	kind: "option" | "detail" | "note" | "custom" | "editor";
};

export function renderPanel(
	session: Session,
	layout: PanelLayout,
	style: PanelStyle,
): string[] {
	const { width } = layout;
	const question = session.questions[session.active];
	const head: string[] = [];

	if (session.questions.length > 1)
		head.push(renderTabs(session, width, style));
	head.push(
		style.bold(
			style.truncate(oneLine(question.title ?? question.question), width),
		),
	);

	const body: Row[] = [];
	const selected = session.selected[session.active];
	const multi = question.multiple;

	for (const [index, option] of question.options.entries()) {
		const focused =
			session.phase.kind === "list" &&
			session.focus.kind === "option" &&
			session.focus.index === index;
		const cursor = focused ? "› " : "  ";
		const mark = multi
			? selected.includes(index)
				? "✓ "
				: "  "
			: selected.includes(index)
				? "● "
				: "○ ";
		const number = index < 9 ? `${index + 1}. ` : "   ";
		const text = style.truncate(
			`${cursor}${mark}${number}${oneLine(option.label)}`,
			width,
		);
		body.push({ text: focused ? style.accent(text) : text, kind: "option" });

		if (option.detail !== undefined) {
			body.push({
				text: style.muted(
					style.truncate(`      ${oneLine(option.detail)}`, width),
				),
				kind: "detail",
			});
		}
		if (!multi && selected.length === 1 && selected[0] === index) {
			const note = session.notes[session.active];
			if (note !== "") {
				body.push({
					text: style.muted(style.truncate(`      ↳ ${oneLine(note)}`, width)),
					kind: "note",
				});
			}
		}
	}

	if (session.phase.kind === "custom" && layout.editorLines !== undefined) {
		for (const line of layout.editorLines)
			body.push({ text: line, kind: "editor" });
	} else {
		const focused =
			session.phase.kind === "list" && session.focus.kind === "custom";
		const draft =
			session.customs[session.active] || session.customDrafts[session.active];
		const label = draft === "" ? "Custom…" : `Custom: ${oneLine(draft)}`;
		const text = style.truncate(`${focused ? "› " : "  "}  ${label}`, width);
		body.push({ text: focused ? style.accent(text) : text, kind: "custom" });
	}

	if (session.phase.kind === "note" && layout.editorLines !== undefined) {
		body.push({
			text: style.muted(
				style.truncate(`  note for option ${session.phase.option + 1}`, width),
			),
			kind: "editor",
		});
		for (const line of layout.editorLines)
			body.push({ text: line, kind: "editor" });
	}

	const preview = previewLines(session, layout, style);
	const hint = style.muted(
		style.truncate(hintFor(session, layout.keys), width),
	);
	const budget = Math.max(1, layout.height - head.length - 1);
	const middle = composeBody(
		body,
		preview,
		budget,
		focusIndex(session),
		layout,
		style,
	);
	return [...head, ...middle, hint];
}

function renderTabs(
	session: Session,
	width: number,
	style: PanelStyle,
): string {
	const tabs = session.questions.map((question, index) => {
		const label = oneLine(question.title ?? question.question);
		const text = `${index + 1} ${label}`;
		const filled = index === session.active ? style.accent(text) : text;
		return isAnsweredAt(session, index) ? `✓ ${filled}` : filled;
	});
	return style.truncate(tabs.join("  "), width);
}

function isAnsweredAt(session: Session, index: number): boolean {
	return (
		session.selected[index].length > 0 || session.customs[index].trim() !== ""
	);
}

/** render() 返回的每个元素必须正好一行：任何换行只取首行。 */
function oneLine(text: string): string {
	return (text.split(/\r?\n/)[0] ?? "").trim();
}

function hintFor(
	session: Session,
	keys: { annotate: string; submitEarly: string },
): string {
	if (session.phase.kind === "note") return "enter save · esc back";
	if (session.phase.kind === "custom")
		return "enter save · shift+enter newline · esc back";
	return `esc abort · enter pick · space toggle · ${keys.annotate} note · ${keys.submitEarly} submit · ↑↓/tab move`;
}

type PreviewBlock = { lines: string[]; sideBySide: boolean };

function previewLines(
	session: Session,
	layout: PanelLayout,
	style: PanelStyle,
): PreviewBlock {
	if (session.phase.kind !== "list" || session.focus.kind !== "option") {
		return { lines: [], sideBySide: false };
	}
	const option = session.questions[session.active].options[session.focus.index];
	const markdown = option?.preview;
	if (markdown === undefined || markdown.trim() === "") {
		return { lines: [], sideBySide: false };
	}
	const sideBySide =
		layout.width >= Math.max(layout.minSideBySideWidth, MIN_SIDE_BY_SIDE_WIDTH);
	const columnWidth = sideBySide
		? leftColumnWidth(layout.width)
		: Math.max(0, layout.width - 2);
	const lines = style
		.markdown(markdown, columnWidth)
		.flatMap((line) => line.split(/\r?\n/));
	return {
		lines: sideBySide
			? lines
			: lines.map((line) => style.truncate(`  ${line}`, layout.width)),
		sideBySide,
	};
}

/** 两栏加 " │ " 至少要有 8 列，否则退回堆叠。 */
const MIN_SIDE_BY_SIDE_WIDTH = 8;

function leftColumnWidth(width: number): number {
	return Math.max(0, Math.floor((width - 3) / 2));
}

function composeBody(
	body: Row[],
	preview: PreviewBlock,
	budget: number,
	focus: number,
	layout: PanelLayout,
	style: PanelStyle,
): string[] {
	if (preview.sideBySide) {
		const leftWidth = leftColumnWidth(layout.width);
		const rightWidth = Math.max(0, layout.width - leftWidth - 3);
		// 两栏各自裁：左栏先丢 detail 再收选项窗口，右栏只留前 budget 行。
		const rows = trimRows(body, budget, focus);
		const right = preview.lines
			.slice(0, budget)
			.map((line) => style.truncate(line, rightWidth));
		const depth = Math.min(budget, Math.max(rows.length, right.length));
		const merged: string[] = [];
		for (let index = 0; index < depth; index += 1) {
			const left = style.truncate(rows[index] ?? "", leftWidth);
			const padding = " ".repeat(Math.max(0, leftWidth - style.width(left)));
			merged.push(`${left}${padding} │ ${right[index] ?? ""}`);
		}
		return merged;
	}

	// 堆叠：先裁 preview 行，再裁 detail 行，最后收选项窗口。
	const room = budget - body.length;
	if (preview.lines.length <= room)
		return [...body.map((row) => row.text), ...preview.lines];
	const shownPreview = preview.lines.slice(0, Math.max(0, room));
	if (shownPreview.length > 0)
		return [...body.map((row) => row.text), ...shownPreview];
	return trimRows(body, budget, focus);
}

/**
 * 先丢 detail/note，再把选项收成围绕焦点的窗口。
 * custom 与编辑行优先留着；编辑行留尾部，光标与最新输入不能被裁掉。
 */
function trimRows(rows: Row[], budget: number, focus: number): string[] {
	if (rows.length <= budget) return rows.map((row) => row.text);

	const keep = rows.filter(
		(row) =>
			row.kind === "option" || row.kind === "custom" || row.kind === "editor",
	);
	if (keep.length <= budget) return keep.map((row) => row.text);

	const pinned = keep.filter(
		(row) => row.kind === "custom" || row.kind === "editor",
	);
	const options = keep.filter((row) => row.kind === "option");
	if (pinned.length >= budget)
		return pinned.slice(pinned.length - budget).map((row) => row.text);

	const optionBudget = budget - pinned.length;
	const start = Math.min(
		Math.max(0, options.length - optionBudget),
		Math.max(0, focus - Math.floor(optionBudget / 2)),
	);
	const windowed = options.slice(start, start + optionBudget);
	const pinnedTail = pinned.slice(pinned.length - (budget - windowed.length));
	return [...windowed, ...pinnedTail].map((row) => row.text);
}

function focusIndex(session: Session): number {
	if (session.focus.kind === "option") return session.focus.index;
	return session.questions[session.active].options.length;
}

export function summarize(outcome: Outcome, questions: Question[]): string {
	if (outcome.kind === "abort") {
		return "User aborted the questions without answering. Do not repeat them unless the user asks.";
	}
	const lines = outcome.answers.map((answer) => {
		const labels = answer.selected
			.map(
				(index) =>
					questions[answer.index]?.options[index]?.label ?? `#${index + 1}`,
			)
			.join(", ");
		const parts: string[] = [];
		if (labels !== "") parts.push(labels);
		if (answer.custom !== undefined) parts.push(`custom: ${answer.custom}`);
		if (answer.note !== undefined) parts.push(`note: ${answer.note}`);
		return `${answer.index + 1}. ${answer.question} => ${parts.join(" | ")}`;
	});
	const skipped =
		outcome.skipped.length > 0
			? ` Skipped questions: ${outcome.skipped.map((index) => index + 1).join(", ")}.`
			: "";
	return `Answered ${outcome.answers.length} of ${questions.length} questions.\n${lines.join("\n")}${skipped}`;
}
