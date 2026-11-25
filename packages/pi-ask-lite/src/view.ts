import type { Question } from "./schema.ts";
import type { Answer, AskDetails, Outcome, Session } from "./state.ts";

export type PanelStyle = {
	accent(text: string): string;
	muted(text: string): string;
	bold(text: string): string;
	width(text: string): number;
	truncate(text: string, width: number): string;
	/** 按宽折行，保留每行原有 ANSI；调用方保证 width > 0。 */
	wrap(text: string, width: number): string[];
	markdown(text: string, width: number): string[];
};

export type PanelLayout = {
	width: number;
	height: number;
	keys: { annotate: string; submitEarly: string; collapse?: string };
	showHints: boolean;
	minSideBySideWidth: number;
	/** 编辑区内容行（无边框、无缩进）：view 给宽度并负责前缀。 */
	editorLines?(width: number): string[];
};

type RowKind = "option" | "detail" | "note" | "custom" | "confirm" | "editor";
type Row = { text: string; kind: RowKind; group: number };
type PreviewBlock = { lines: string[]; sideBySide: boolean };

const DIVIDER = "─";
const CONTENT_INDENT = "  ";
const TAB_SEPARATOR = "  ";
const LABEL_GAP = "   ";
const CURSOR = "› ";
const CUSTOM_MARK = "+ ";
const CONFIRM_LABEL = "→ Confirm";
const NOTE_MARK = "↳ ";
const EDITOR_BAR = "▎ ";
const PREVIEW_HEADER = "Preview";
const MAX_DETAIL_LINES = 2;
/** 左栏按比例收窄，中间不再留一条黑沟；上限保证长选项不被压得太碎。 */
const LEFT_COLUMN_RATIO = 0.42;
const MAX_LEFT_COLUMN = 54;
const MIN_LEFT_COLUMN = 12;
const MIN_RIGHT_COLUMN = 12;
const SEPARATOR = " │ ";
/** 两栏都留够可读宽度才并排，否则退回堆叠。 */
const MIN_SIDE_BY_SIDE_WIDTH =
	CONTENT_INDENT.length + MIN_LEFT_COLUMN + SEPARATOR.length + MIN_RIGHT_COLUMN;
const COLLAPSED_PREFIX = "Ask collapsed";

export function renderPanel(
	session: Session,
	layout: PanelLayout,
	style: PanelStyle,
): string[] {
	const { width, height } = layout;
	if (session.collapsed) return [collapsedLine(session, layout, style)];

	const question = session.questions[session.active];
	const contentWidth = Math.max(0, width - CONTENT_INDENT.length);

	const head: string[] = [style.muted(DIVIDER.repeat(width))];
	if (session.questions.length > 1)
		head.push(renderTabs(session, width, style));

	const tail = layout.showHints
		? [
				style.muted(
					style.truncate(`${CONTENT_INDENT}${hintFor(session, layout)}`, width),
				),
			]
		: [];
	const questionRoom = Math.max(1, height - head.length - tail.length - 1);
	for (const line of wrapBlock(
		question.question,
		contentWidth,
		questionRoom,
		style,
	))
		head.push(style.bold(style.truncate(`${CONTENT_INDENT}${line}`, width)));

	const budget = Math.max(1, height - head.length - tail.length);
	const preview = previewBlock(session, layout, style);
	const body = bodyRows(
		session,
		layout,
		style,
		preview.sideBySide ? leftColumnWidth(width) : contentWidth,
	);
	const middle = composeBody(body, preview, budget, session, layout, style).map(
		(line) => (line === "" ? "" : `${CONTENT_INDENT}${line}`),
	);
	return [...head, ...middle, ...tail];
}

function renderTabs(
	session: Session,
	width: number,
	style: PanelStyle,
): string {
	const tabs = session.questions.map((question, index) => {
		const label = oneLine(question.title ?? `Q${index + 1}`);
		const answered = isAnsweredAt(session, index) ? "✓ " : "";
		const text = `${answered}${index + 1} ${label}`;
		return index === session.active
			? style.accent(style.bold(`[${text}]`))
			: style.muted(text);
	});
	return style.truncate(`${CONTENT_INDENT}${tabs.join(TAB_SEPARATOR)}`, width);
}

function isAnsweredAt(session: Session, index: number): boolean {
	return (
		session.selected[index].length > 0 || session.customs[index].trim() !== ""
	);
}

/** 折叠后只剩一行：已答进度 + 展开键；焦点与草稿都没动。 */
function collapsedLine(
	session: Session,
	layout: PanelLayout,
	style: PanelStyle,
): string {
	const answered = session.questions.filter((_question, index) =>
		isAnsweredAt(session, index),
	).length;
	const parts = [
		`${COLLAPSED_PREFIX} (${answered}/${session.questions.length})`,
	];
	if (layout.keys.collapse !== undefined)
		parts.push(`${layout.keys.collapse} expand`);
	return style.muted(
		style.truncate(`${CONTENT_INDENT}${parts.join(" · ")}`, layout.width),
	);
}

/** 提示收短并只留当前形态能用的键；调用方负责 dim 与缩进。 */
function hintFor(session: Session, layout: PanelLayout): string {
	const keys = layout.keys;
	if (session.phase.kind === "note") return "enter save · esc back";
	if (session.phase.kind === "custom")
		return "enter save · shift+enter newline · esc back";

	const multiple = session.questions[session.active].multiple;
	const parts = multiple
		? ["enter toggle"]
		: ["enter pick", `${keys.annotate} note`];
	if (session.questions.length > 1) {
		parts.push("tab next", `${keys.submitEarly} submit`);
	} else if (multiple) {
		parts.push(`${keys.submitEarly} submit`);
	}
	if (keys.collapse !== undefined) parts.push(`${keys.collapse} collapse`);
	parts.push("esc");
	return parts.join(" · ");
}

function bodyRows(
	session: Session,
	layout: PanelLayout,
	style: PanelStyle,
	width: number,
): Row[] {
	const question = session.questions[session.active];
	const selected = session.selected[session.active];
	const multi = question.multiple;
	const customGroup = question.options.length;
	const confirmGroup = customGroup + 1;
	const indent = " ".repeat(labelColumn(multi));
	const editing = session.phase.kind === "note" ? session.phase.option : -1;
	const body: Row[] = [];

	for (const [index, option] of question.options.entries()) {
		const active = isActive(session, index);
		const checked = selected.includes(index);
		const cursor = active ? CURSOR : !multi && checked ? "✓ " : "  ";
		const box = multi ? (checked ? "■ " : "□ ") : "";
		const number = index < 9 ? `${index + 1}. ` : LABEL_GAP;
		const text = style.truncate(
			`${cursor}${box}${number}${oneLine(option.label)}`,
			width,
		);
		body.push({
			text: active ? style.accent(text) : text,
			kind: "option",
			group: index,
		});

		if (option.detail !== undefined) {
			for (const line of wrapBlock(
				option.detail,
				width - indent.length,
				MAX_DETAIL_LINES,
				style,
			))
				body.push({
					text: style.muted(style.truncate(`${indent}${line}`, width)),
					kind: "detail",
					group: index,
				});
		}

		if (!multi && selected.length === 1 && selected[0] === index) {
			const note = oneLine(session.notes[session.active]);
			if (note !== "")
				body.push({
					text: style.muted(
						style.truncate(`${indent}${NOTE_MARK}${note}`, width),
					),
					kind: "note",
					group: index,
				});
		}

		// 补充说明就地编辑：紧贴该选项（含 detail）下方，不另占一行提示。
		if (editing === index) {
			const editorWidth = Math.max(1, width - indent.length - NOTE_MARK.length);
			for (const line of layout.editorLines?.(editorWidth) ?? [])
				body.push({
					text: style
						.truncate(`${indent}${style.muted(NOTE_MARK)}${line}`, width)
						.trimEnd(),
					kind: "editor",
					group: index,
				});
		}
	}

	if (session.phase.kind === "custom") {
		body.push({
			text: style.accent(
				style.truncate(`${CURSOR}${CUSTOM_MARK}Custom`, width),
			),
			kind: "custom",
			group: customGroup,
		});
		const editorWidth = Math.max(1, width - EDITOR_BAR.length);
		for (const line of layout.editorLines?.(editorWidth) ?? [])
			body.push({
				text: style
					.truncate(`${style.muted(EDITOR_BAR)}${line}`, width)
					.trimEnd(),
				kind: "editor",
				group: customGroup,
			});
	} else {
		const focused =
			session.phase.kind === "list" && session.focus.kind === "custom";
		const draft =
			session.customs[session.active] || session.customDrafts[session.active];
		const label =
			draft === ""
				? `${CUSTOM_MARK}Custom…`
				: `${CUSTOM_MARK}Custom: ${oneLine(draft)}`;
		const text = style.truncate(`${focused ? CURSOR : "  "}${label}`, width);
		body.push({
			text: focused ? style.accent(text) : style.muted(text),
			kind: "custom",
			group: customGroup,
		});
	}

	if (multi && session.phase.kind === "list") {
		const focused = session.focus.kind === "confirm";
		const text = style.truncate(
			`${focused ? CURSOR : "  "}${CONFIRM_LABEL}`,
			width,
		);
		body.push({
			text: focused ? style.accent(text) : style.muted(text),
			kind: "confirm",
			group: confirmGroup,
		});
	}

	return body;
}

/** 选项 label 所在列：cursor 2 列 +（多选方框 2 列）+ 序号 3 列。 */
function labelColumn(multi: boolean): number {
	return multi ? `${CURSOR}■ 1. `.length : `${CURSOR}1. `.length;
}

function isActive(session: Session, index: number): boolean {
	return (
		(session.phase.kind === "list" || session.phase.kind === "note") &&
		session.focus.kind === "option" &&
		session.focus.index === index
	);
}

/** render() 返回的每个元素必须正好一行：任何换行只取首行。 */
function oneLine(text: string): string {
	return (text.split(/\r?\n/)[0] ?? "").trim();
}

function wrapBlock(
	text: string,
	width: number,
	maxLines: number,
	style: PanelStyle,
): string[] {
	if (width <= 0 || maxLines <= 0) return [];
	const lines = style
		.wrap(text, width)
		.map((line) => style.truncate(line.trimEnd(), width));
	while (lines.length > 0 && lines[0] === "") lines.shift();
	while (lines.length > 0 && lines.at(-1) === "") lines.pop();
	if (lines.length === 0) return [""];
	if (lines.length <= maxLines) return lines;

	const kept = lines.slice(0, maxLines);
	const last = kept[maxLines - 1] ?? "";
	kept[maxLines - 1] = style.truncate(`${last}…`, width);
	return kept;
}

function previewBlock(
	session: Session,
	layout: PanelLayout,
	style: PanelStyle,
): PreviewBlock {
	if (session.phase.kind !== "list" || session.focus.kind !== "option")
		return { lines: [], sideBySide: false };
	const option = session.questions[session.active].options[session.focus.index];
	const markdown = option?.preview;
	if (markdown === undefined || markdown.trim() === "")
		return { lines: [], sideBySide: false };

	const sideBySide =
		layout.width >= Math.max(layout.minSideBySideWidth, MIN_SIDE_BY_SIDE_WIDTH);
	const contentWidth = sideBySide
		? rightColumnWidth(layout.width)
		: Math.max(0, layout.width - CONTENT_INDENT.length);
	const content =
		contentWidth <= 0 ? [] : markdownLines(markdown, contentWidth, style);
	while (content.length > 0 && content.at(-1) === "") content.pop();

	if (sideBySide)
		return { lines: [style.muted(PREVIEW_HEADER), ...content], sideBySide };
	return {
		lines: [
			style.muted(style.truncate(PREVIEW_HEADER, contentWidth)),
			...content.map((line) => style.truncate(line, contentWidth)),
		],
		sideBySide: false,
	};
}

function markdownLines(
	markdown: string,
	width: number,
	style: PanelStyle,
): string[] {
	return style
		.markdown(markdown, width)
		.flatMap((line) => line.split(/\r?\n/))
		.map((line) => style.truncate(line.trimEnd(), width));
}

function leftColumnWidth(width: number): number {
	const content = Math.max(0, width - CONTENT_INDENT.length);
	const budget = Math.max(0, content - SEPARATOR.length - MIN_RIGHT_COLUMN);
	return Math.max(
		0,
		Math.min(Math.floor(width * LEFT_COLUMN_RATIO), MAX_LEFT_COLUMN, budget),
	);
}

function rightColumnWidth(width: number): number {
	return Math.max(
		0,
		width - CONTENT_INDENT.length - leftColumnWidth(width) - SEPARATOR.length,
	);
}

function composeBody(
	body: Row[],
	preview: PreviewBlock,
	budget: number,
	session: Session,
	layout: PanelLayout,
	style: PanelStyle,
): string[] {
	const focus = focusRow(session);
	const pinned = pinnedGroups(session);

	if (preview.sideBySide) {
		const leftWidth = leftColumnWidth(layout.width);
		const rightWidth = rightColumnWidth(layout.width);
		// 两栏各自裁：左栏先丢 detail 再收选项窗口，右栏只留前 budget 行。
		const rows = trimRows(body, budget, focus, pinned);
		const right = preview.lines
			.slice(0, budget)
			.map((line) => style.truncate(line, rightWidth));
		const depth = Math.min(budget, Math.max(rows.length, right.length));
		const bar = style.muted("│");
		const merged: string[] = [];
		for (let index = 0; index < depth; index += 1) {
			const left = style.truncate(rows[index] ?? "", leftWidth);
			const padding = " ".repeat(Math.max(0, leftWidth - style.width(left)));
			const text = right[index] ?? "";
			merged.push(`${left}${padding} ${bar} ${text}`.trimEnd());
		}
		return merged;
	}

	// 堆叠：先裁 preview 行，再裁 detail 行，最后收选项窗口。
	const room = budget - body.length;
	if (room >= preview.lines.length)
		return [...body.map((row) => row.text), ...preview.lines];
	if (room >= 2)
		return [...body.map((row) => row.text), ...preview.lines.slice(0, room)];
	return trimRows(body, budget, focus, pinned);
}

/** 焦点行号：选项序号 / Custom / Confirm。 */
function focusRow(session: Session): number {
	const options = session.questions[session.active].options.length;
	if (session.focus.kind === "option") return session.focus.index;
	return session.focus.kind === "custom" ? options : options + 1;
}

/** 编辑中的块不能被裁走：note 钉选项，custom 钉输入区；列表态钉 Custom 与 Confirm。 */
function pinnedGroups(session: Session): number[] {
	const count = session.questions[session.active].options.length;
	if (session.phase.kind === "note") return [session.phase.option];
	if (session.phase.kind === "custom") return [count];
	return session.questions[session.active].multiple
		? [count, count + 1]
		: [count];
}

/**
 * 先丢 detail / note 行，再按组收窗口：焦点组优先，其余按到焦点的距离补，
 * 钉住的组永远留着。
 */
function trimRows(
	rows: Row[],
	budget: number,
	focus: number,
	pinned: number[],
): string[] {
	const texts = (list: Row[]) => list.map((row) => row.text);
	if (rows.length <= budget) return texts(rows);
	const lean = rows.filter(
		(row) => row.kind !== "detail" && row.kind !== "note",
	);
	if (lean.length <= budget) return texts(lean);

	const groups = [...new Set(lean.map((row) => row.group))];
	// 钉住的块放不进预算时先让位给焦点：高度极紧时先看得见自己在操作哪一项。
	const pinnedRows = lean.filter((row) => pinned.includes(row.group)).length;
	const chosen = new Set<number>();
	let used = 0;
	if (pinnedRows < budget) {
		for (const group of groups) {
			if (!pinned.includes(group)) continue;
			chosen.add(group);
		}
		used = pinnedRows;
	}

	if (!chosen.has(focus)) {
		const count = lean.filter((row) => row.group === focus).length;
		if (used + count <= budget) {
			chosen.add(focus);
			used += count;
		} else if (chosen.size === 0 && count > 0) {
			// 焦点块自己就超预算：留它的尾部（输入行与光标在最后）。
			chosen.add(focus);
			used = budget;
		}
	}
	const rest = groups
		.filter((group) => !chosen.has(group))
		.sort((a, b) => Math.abs(a - focus) - Math.abs(b - focus) || a - b);
	for (const group of rest) {
		const count = lean.filter((row) => row.group === group).length;
		if (used + count > budget) continue;
		chosen.add(group);
		used += count;
	}

	const kept = lean.filter((row) => chosen.has(row.group));
	return texts(kept.length <= budget ? kept : kept.slice(kept.length - budget));
}

/** 调用行的题目标签：`title`，缺省取 question 首行。 */
export type DisplayQuestion = {
	title?: string;
	question: string;
	options: { label: string }[];
};

export function callLabels(questions: readonly DisplayQuestion[]): string {
	return questions.map(displayTitle).join(" · ");
}

export type ResultLine = {
	text: string;
	kind: "answer" | "skipped" | "aborted";
};

/** 结果摘要：每题一行，跳过的题 dim，中止只有一行。 */
export function resultLines(
	details: AskDetails,
	questions: readonly DisplayQuestion[],
): ResultLine[] {
	if (details.aborted) return [{ text: "✗ aborted", kind: "aborted" }];

	const answers = new Map(
		details.answers.map((answer) => [answer.index, answer]),
	);
	const skipped = new Set(details.skipped ?? []);
	const count = Math.max(
		questions.length,
		...details.answers.map((answer) => answer.index + 1),
		...[...skipped].map((index) => index + 1),
	);
	const lines: ResultLine[] = [];
	for (let index = 0; index < count; index += 1) {
		const question = questions[index];
		const answer = answers.get(index);
		if (answer === undefined) {
			if (skipped.has(index))
				lines.push({
					text: `${questionLabel(question, index)}: skipped`,
					kind: "skipped",
				});
			continue;
		}
		lines.push({
			text: `✓ ${questionLabel(question, index)}: ${answerText(answer, question)}`,
			kind: "answer",
		});
	}
	return lines;
}

function questionLabel(
	question: DisplayQuestion | undefined,
	index: number,
): string {
	return question === undefined
		? `Q${index + 1}`
		: displayTitle(question, index);
}

function answerText(
	answer: Answer,
	question: DisplayQuestion | undefined,
): string {
	const parts = answer.selected.map((index) => {
		const label = question?.options[index]?.label;
		return label === undefined ? `#${index + 1}` : oneLine(label);
	});
	if (answer.custom !== undefined) parts.push(`custom: ${answer.custom}`);
	if (answer.note !== undefined) parts.push(`note: ${answer.note}`);
	return parts.join(" · ");
}

function displayTitle(question: DisplayQuestion, index: number): string {
	const title = oneLine(question.title ?? "");
	if (title !== "") return title;
	const text = oneLine(question.question);
	return text === "" ? `Q${index + 1}` : text;
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
