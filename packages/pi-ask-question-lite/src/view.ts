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

const DIVIDER = "─";
const TAB_SEPARATOR = "  ";
const LABEL_GAP = "   ";
const CURSOR = "› ";
const CUSTOM_MARK = "+ ";
const CONFIRM_LABEL = "→ Confirm";
const NOTE_MARK = "↳ ";
const EDITOR_BAR = "▎ ";
/** detail 折到 4 行就收 …；再挤由 trimRows 按既有裁剪顺序统一收口。 */
const MAX_DETAIL_LINES = 4;
/** 两栏各自的下限：再窄就只剩省略号，不如让对方先吃饱。 */
const MIN_LEFT_COLUMN = 12;
const MIN_RIGHT_COLUMN = 12;
/** 竖线左 2 右 1：左栏的省略号不贴着竖线。 */
const SEPARATOR_LEFT = "  ";
const SEPARATOR_RIGHT = " ";
const SEPARATOR = `${SEPARATOR_LEFT}│${SEPARATOR_RIGHT}`;
/** 两栏都留够可读宽度才并排，否则退回堆叠。 */
const MIN_SIDE_BY_SIDE_WIDTH =
	MIN_LEFT_COLUMN + SEPARATOR.length + MIN_RIGHT_COLUMN;
const COLLAPSED_PREFIX = "Ask collapsed";

export function renderPanel(
	session: Session,
	layout: PanelLayout,
	style: PanelStyle,
): string[] {
	const { width, height } = layout;
	if (session.collapsed) return [collapsedLine(session, layout, style)];

	const question = session.questions[session.active];
	const preview = previewMarkdown(session);
	const sideBySide = preview !== undefined && isSideBySide(layout);

	const tabs =
		session.questions.length > 1 ? [renderTabs(session, width, style)] : [];
	// 并排时两栏按内容分宽：左栏要多少给多少，preview 最多占一半。
	const columns = sideBySide
		? splitColumns(
				width,
				leftColumnNeed(session, layout, style, tabs),
				previewNeed(preview ?? "", style),
			)
		: { left: width, right: 0 };
	const leftWidth = columns.left;
	const tail = layout.showHints
		? [style.muted(style.truncate(hintFor(session, layout), width))]
		: [];
	// 题干永远完整折行，但至少给下面的 body 留一行。
	const questionRoom = Math.max(1, height - 1 - tabs.length - tail.length - 1);
	const questionLines = wrapBlock(
		question.question,
		leftWidth,
		questionRoom,
		style,
	);
	const head = [
		...tabs,
		...questionLines.map((line) => style.bold(style.truncate(line, leftWidth))),
	];
	const budget = Math.max(1, height - 1 - head.length - tail.length);
	const body = bodyRows(session, layout, style, leftWidth);
	const { lines: content, trimmed } = composeContent(
		head,
		body,
		preview,
		layout,
		budget,
		session,
		style,
		columns,
	);
	// 余量够时隔开可操作项与暗灰提示、多行题干与首选项；高度紧张时这两行先让给内容。
	let spare = trimmed ? 0 : height - 1 - content.length - tail.length;
	const hintGap = tail.length > 0 && spare > 0 ? [""] : [];
	spare -= hintGap.length;
	const questionGap = questionLines.length > 1 && spare > 0 ? [""] : [];
	return [
		style.muted(DIVIDER.repeat(Math.max(0, width))),
		...content.slice(0, head.length),
		...questionGap,
		...content.slice(head.length),
		...hintGap,
		...tail,
	];
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
	return style.truncate(tabs.join(TAB_SEPARATOR), width);
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
	return style.muted(style.truncate(parts.join(" · "), layout.width));
}

/** 提示收短并只留当前形态能用的键；调用方负责 dim 与截断。 */
function hintFor(session: Session, layout: PanelLayout): string {
	const keys = layout.keys;
	if (session.phase.kind === "note") return "enter save · esc back";
	if (session.phase.kind === "custom")
		return "enter save · shift+enter newline · esc back";

	const multiple = session.questions[session.active].multiple;
	const parts = [
		multiple ? "enter toggle" : "enter pick",
		`${keys.annotate} note`,
	];
	if (session.questions.length > 1) {
		parts.push("tab next", `${keys.submitEarly} submit`);
	} else if (multiple) {
		parts.push(`${keys.submitEarly} submit`);
	}
	if (keys.collapse !== undefined) parts.push(`${keys.collapse} collapse`);
	parts.push("esc abort");
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

		const note = session.optionNotes[session.active][String(index)];
		// 正在编辑这一条时输入框里就是它，别再画一遍旧值。
		if (note !== undefined && editing !== index)
			body.push({
				text: style.muted(
					style.truncate(`${indent}${NOTE_MARK}${oneLine(note)}`, width),
				),
				kind: "note",
				group: index,
			});

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
				gutterRow(true, `${CUSTOM_MARK}Custom`, multi, width, style),
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
		const text = gutterRow(focused, label, multi, width, style);
		body.push({
			text: focused ? style.accent(text) : style.muted(text),
			kind: "custom",
			group: customGroup,
		});
	}

	if (multi && session.phase.kind === "list") {
		const focused = session.focus.kind === "confirm";
		const text = gutterRow(focused, CONFIRM_LABEL, multi, width, style);
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

/** Custom / Confirm 行：光标留在第 0 列，正文对齐选项 label 列。 */
function gutterRow(
	focused: boolean,
	text: string,
	multi: boolean,
	width: number,
	style: PanelStyle,
): string {
	const pad = " ".repeat(Math.max(0, labelColumn(multi) - CURSOR.length));
	return style.truncate(
		`${focused ? CURSOR : " ".repeat(CURSOR.length)}${pad}${text}`,
		width,
	);
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

/** 只有列表态、焦点在选项上、且该项带非空 preview 时才画预览。 */
function previewMarkdown(session: Session): string | undefined {
	if (session.phase.kind !== "list" || session.focus.kind !== "option")
		return undefined;
	const option = session.questions[session.active].options[session.focus.index];
	const markdown = option?.preview;
	if (markdown === undefined || markdown.trim() === "") return undefined;
	return markdown;
}

function isSideBySide(layout: PanelLayout): boolean {
	return (
		layout.width >= Math.max(layout.minSideBySideWidth, MIN_SIDE_BY_SIDE_WIDTH)
	);
}

function markdownLines(
	markdown: string,
	width: number,
	style: PanelStyle,
): string[] {
	const lines = style
		.markdown(markdown, width)
		.flatMap((line) => line.split(/\r?\n/))
		.map((line) => style.truncate(line.trimEnd(), width));
	while (lines.length > 0 && lines.at(-1) === "") lines.pop();
	return lines;
}

/**
 * 两栏按内容分宽，竖线没有固定位置：preview 最多要一半，左栏拿剩下的列再按
 * 自己的内容收窄；两边都装得下时各按各的内容，右侧多出来的列留白。
 */
function splitColumns(
	width: number,
	needLeft: number,
	needRight: number,
): { left: number; right: number } {
	const room = Math.max(0, width - SEPARATOR.length);
	const rightCap = Math.max(
		MIN_RIGHT_COLUMN,
		Math.min(needRight, Math.floor(room / 2)),
	);
	const left = Math.max(MIN_LEFT_COLUMN, Math.min(needLeft, room - rightCap));
	const right = Math.max(MIN_RIGHT_COLUMN, Math.min(needRight, room - left));
	return { left, right };
}

/**
 * 左栏要的宽度：题干、选项、detail、Custom/Confirm 先按满宽排一遍再量最宽行，
 * 长 detail 就不会在左栏还宽着时被折行。编辑中的输入行不算，否则每敲一个键
 * 竖线就跟着跳。
 */
function leftColumnNeed(
	session: Session,
	layout: PanelLayout,
	style: PanelStyle,
	tabs: readonly string[],
): number {
	const question = session.questions[session.active];
	const body = bodyRows(session, layout, style, layout.width).filter(
		(row) => row.kind !== "editor",
	);
	return widest(
		[
			...tabs,
			...question.question.split(/\r?\n/),
			...body.map((row) => row.text),
		],
		style,
	);
}

/** preview 想要的宽度：按源码最长行估，markdown 的粗体与标题只差一两列。 */
function previewNeed(markdown: string, style: PanelStyle): number {
	return widest(markdown.split(/\r?\n/), style);
}

function widest(lines: readonly string[], style: PanelStyle): number {
	let width = 0;
	for (const line of lines)
		if (line !== "") width = Math.max(width, style.width(line));
	return width;
}

type Composed = { lines: string[]; trimmed: boolean };

/**
 * 并排时右栏从 Tab / 题干那一行就顶对齐，右栏省下的行不把面板撑高。
 * 堆叠时 preview 接在选项下方，两者抢同一列才需要统一的裁剪顺序。
 * `trimmed` 表示这一屏已经为高度让过位：调用方据此省掉呼吸空行。
 */
function composeContent(
	head: string[],
	body: Row[],
	markdown: string | undefined,
	layout: PanelLayout,
	budget: number,
	session: Session,
	style: PanelStyle,
	columns: { left: number; right: number },
): Composed {
	const width = layout.width;
	const focus = focusRow(session);
	const pinned = pinnedGroups(session);

	if (markdown !== undefined && isSideBySide(layout)) {
		// 两栏各自裁：左栏先丢 detail 再收选项窗口，右栏只留前 budget 行。
		const { left: leftWidth, right: rightWidth } = columns;
		const kept = trimRows(
			body,
			Math.max(0, budget - head.length),
			focus,
			pinned,
		);
		const left = [...head, ...kept];
		// 右栏按 preview 自己的行宽收：短 preview 不拉满，长 preview 折在分到的列里。
		const all = markdownLines(markdown, rightWidth, style);
		const fit = Math.min(
			rightWidth,
			Math.max(MIN_RIGHT_COLUMN, widest(all, style)),
		);
		const right = all.slice(0, Math.max(0, budget));
		const bar = style.muted("│");
		const merged: string[] = [];
		const depth = Math.max(left.length, right.length);
		for (let index = 0; index < depth; index += 1) {
			const cell = style.truncate(left[index] ?? "", leftWidth);
			const padding = " ".repeat(Math.max(0, leftWidth - style.width(cell)));
			merged.push(
				`${cell}${padding}${SEPARATOR_LEFT}${bar}${SEPARATOR_RIGHT}${style.truncate(
					right[index] ?? "",
					fit,
				)}`.trimEnd(),
			);
		}
		return {
			lines: merged,
			trimmed: kept.length < body.length || right.length < all.length,
		};
	}

	// 堆叠：先裁 preview 行，再裁 detail 行，最后收选项窗口。
	const preview =
		markdown === undefined ? [] : markdownLines(markdown, width, style);
	const texts = body.map((row) => row.text);
	const room = budget - body.length;
	if (room >= preview.length)
		return { lines: [...head, ...texts, ...preview], trimmed: false };
	if (room >= 2)
		return {
			lines: [...head, ...texts, ...preview.slice(0, room)],
			trimmed: true,
		};
	const kept = trimRows(body, budget, focus, pinned);
	return { lines: [...head, ...kept], trimmed: kept.length < body.length };
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

	const lines: ResultLine[] = [];
	for (const entry of resultEntries(details, questions)) {
		if (entry.answer === undefined) {
			if (entry.skipped)
				lines.push({
					text: `${questionLabel(entry.question, entry.index)}: skipped`,
					kind: "skipped",
				});
			continue;
		}
		lines.push({
			text: `✓ ${questionLabel(entry.question, entry.index)}: ${answerText(entry.answer, entry.question)}`,
			kind: "answer",
		});
	}
	return lines;
}

type ResultEntry = {
	index: number;
	question: DisplayQuestion | undefined;
	answer: Answer | undefined;
	skipped: boolean;
};

/** 结果行的公共骨架：按题序把答题、跳过、没提到的题都排出来。 */
function resultEntries(
	details: AskDetails,
	questions: readonly DisplayQuestion[],
): ResultEntry[] {
	const answers = new Map(
		details.answers.map((answer) => [answer.index, answer]),
	);
	const skipped = new Set(details.skipped ?? []);
	const count = Math.max(
		questions.length,
		...details.answers.map((answer) => answer.index + 1),
		...[...skipped].map((index) => index + 1),
	);
	const entries: ResultEntry[] = [];
	for (let index = 0; index < count; index += 1)
		entries.push({
			index,
			question: questions[index],
			answer: answers.get(index),
			skipped: skipped.has(index),
		});
	return entries;
}

/**
 * 展开态（宿主 Ctrl+O）：每题给出完整题干、选中的选项与各自的 note、custom，
 * 跳过的题也带上题干，不再压成一行短标签。
 */
export function expandedLines(
	details: AskDetails,
	questions: readonly DisplayQuestion[],
): ResultLine[] {
	if (details.aborted) return [{ text: "✗ aborted", kind: "aborted" }];

	const lines: ResultLine[] = [];
	for (const entry of resultEntries(details, questions)) {
		const label = questionLabel(entry.question, entry.index);
		const body = questionLines(entry.question, label);
		if (entry.answer === undefined) {
			if (entry.skipped)
				lines.push({
					text: block(`${label}: skipped`, body),
					kind: "skipped",
				});
			continue;
		}
		lines.push({
			text: block(`✓ ${label}`, [
				...body,
				...answerLines(entry.answer, entry.question),
			]),
			kind: "answer",
		});
	}
	return lines;
}

function block(header: string, body: readonly string[]): string {
	return [header, ...body.map((line) => `  ${line}`)].join("\n");
}

/** 完整题干；没有 title 且只有一行时它已经写在标题里了，不再重复。 */
function questionLines(
	question: DisplayQuestion | undefined,
	label: string,
): string[] {
	if (question === undefined) return [];
	const lines = question.question.split(/\r?\n/).map((line) => line.trimEnd());
	while (lines.length > 0 && lines.at(-1) === "") lines.pop();
	return lines.length === 1 && lines[0] === label ? [] : lines;
}

function answerLines(
	answer: Answer,
	question: DisplayQuestion | undefined,
): string[] {
	const lines = answer.selected.map((index) => {
		const label = question?.options[index]?.label;
		return `- ${withNote(
			label === undefined ? `#${index + 1}` : oneLine(label),
			noteFor(answer, index),
		)}`;
	});
	if (answer.custom !== undefined) lines.push(`custom: ${answer.custom}`);
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
		return withNote(
			label === undefined ? `#${index + 1}` : oneLine(label),
			noteFor(answer, index),
		);
	});
	if (answer.custom !== undefined) parts.push(`custom: ${answer.custom}`);
	return parts.join(" · ");
}

/** 补充说明紧跟它说明的那个选项；单选只有一条，多选按选项下标取。 */
function noteFor(answer: Answer, index: number): string | undefined {
	return answer.notes?.[String(index)] ?? answer.note;
}

function withNote(label: string, note: string | undefined): string {
	return note === undefined ? label : `${label} (note: ${note})`;
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
			.map((index) =>
				withNote(
					questions[answer.index]?.options[index]?.label ?? `#${index + 1}`,
					noteFor(answer, index),
				),
			)
			.join(", ");
		const parts: string[] = [];
		if (labels !== "") parts.push(labels);
		if (answer.custom !== undefined) parts.push(`custom: ${answer.custom}`);
		return `${answer.index + 1}. ${answer.question} => ${parts.join(" | ")}`;
	});
	const skipped =
		outcome.skipped.length > 0
			? ` Skipped questions: ${outcome.skipped.map((index) => index + 1).join(", ")}.`
			: "";
	return `Answered ${outcome.answers.length} of ${questions.length} questions.\n${lines.join("\n")}${skipped}`;
}
