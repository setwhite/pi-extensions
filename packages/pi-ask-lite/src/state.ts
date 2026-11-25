import type { Question } from "./schema.ts";

/** 按选项下标记的补充说明：多选每个选项一条，单选只可能有选中那一条。 */
export type OptionNotes = Record<string, string>;

export type Answer = {
	index: number;
	question: string;
	selected: number[];
	custom?: string;
	/** 单选的补充说明。 */
	note?: string;
	/** 多选的补充说明，键是选项下标。 */
	notes?: OptionNotes;
	preview?: string;
};

export type Outcome =
	| { kind: "submit"; answers: Answer[]; skipped: number[] }
	| { kind: "abort" };

/** 工具结果的 `details`：回放与界面都读它。 */
export type AskDetails = {
	answers: Answer[];
	skipped?: number[];
	aborted: boolean;
};

export type Focus =
	| { kind: "option"; index: number }
	| { kind: "custom" }
	| { kind: "confirm" };

export type Phase =
	| { kind: "list" }
	| { kind: "note"; option: number; initial: string }
	| { kind: "custom"; initial: string }
	| { kind: "done"; outcome: Outcome };

export type Session = {
	questions: Question[];
	active: number;
	focus: Focus;
	selected: number[][];
	customs: string[];
	optionNotes: OptionNotes[];
	noteDrafts: OptionNotes[];
	customDrafts: string[];
	/** 折叠只改渲染，不动焦点、答案与草稿。 */
	collapsed: boolean;
	phase: Phase;
};

export type Action =
	| { kind: "up" }
	| { kind: "down" }
	| { kind: "nextQuestion" }
	| { kind: "prevQuestion" }
	| { kind: "confirm" }
	| { kind: "toggleCollapse" }
	| { kind: "digit"; value: number }
	| { kind: "annotate" }
	| { kind: "submitEarly" }
	| { kind: "escape" }
	| { kind: "commitNote"; text: string }
	| { kind: "cancelNote"; text: string }
	| { kind: "commitCustom"; text: string }
	| { kind: "cancelCustom"; text: string };

export function createSession(questions: Question[]): Session {
	return {
		questions,
		active: 0,
		focus: { kind: "option", index: 0 },
		selected: questions.map(() => []),
		customs: questions.map(() => ""),
		optionNotes: questions.map(() => ({})),
		noteDrafts: questions.map(() => ({})),
		customDrafts: questions.map(() => ""),
		collapsed: false,
		phase: { kind: "list" },
	};
}

export function isAnswered(session: Session, index: number): boolean {
	return (
		session.selected[index].length > 0 || session.customs[index].trim() !== ""
	);
}

export function reduce(session: Session, action: Action): Session {
	if (session.phase.kind === "done") return session;

	// 折叠时只看得到那一行，别的键一律不生效，免得盲操作改掉答案。
	if (session.collapsed) {
		if (action.kind === "toggleCollapse")
			return { ...session, collapsed: false };
		if (action.kind === "escape") return done(session, { kind: "abort" });
		return session;
	}

	switch (action.kind) {
		case "toggleCollapse":
			return session.phase.kind === "list"
				? { ...session, collapsed: true }
				: session;
		case "commitNote":
			return commitNote(session, action.text);
		case "cancelNote":
			return cancelNote(session, action.text);
		case "commitCustom":
			return commitCustom(session, action.text);
		case "cancelCustom":
			return cancelCustom(session, action.text);
		case "escape":
			if (session.phase.kind !== "list") return session;
			return done(session, { kind: "abort" });
		default:
			break;
	}

	if (session.phase.kind !== "list") return session;

	switch (action.kind) {
		case "up":
			return move(session, -1);
		case "down":
			return move(session, 1);
		case "nextQuestion":
			return switchQuestion(session, 1);
		case "prevQuestion":
			return switchQuestion(session, -1);
		case "confirm":
			return confirm(session);
		case "digit":
			return pickDigit(session, action.value);
		case "annotate":
			return annotate(session);
		case "submitEarly":
			return submitEarly(session);
		default:
			return session;
	}
}

export function buildAnswers(session: Session): Answer[] {
	const answers: Answer[] = [];
	for (const [index, question] of session.questions.entries()) {
		if (!isAnswered(session, index)) continue;
		const selected = [...session.selected[index]].sort((a, b) => a - b);
		const custom = session.customs[index].trim();
		const stored = session.optionNotes[index];
		const preview =
			selected.length > 0 ? question.options[selected[0]].preview : undefined;
		const notes = question.multiple ? pickedNotes(stored, selected) : undefined;
		const note = question.multiple
			? undefined
			: selected.length === 1
				? stored[String(selected[0])]
				: undefined;
		answers.push({
			index,
			question: question.question,
			selected,
			...(custom === "" ? {} : { custom }),
			...(note === undefined ? {} : { note }),
			...(notes === undefined ? {} : { notes }),
			...(preview === undefined ? {} : { preview }),
		});
	}
	return answers;
}

/** 多选只带选中的那几条：取消勾选时已经删过，这里再筛一遍防脏数据。 */
function pickedNotes(
	stored: OptionNotes,
	selected: readonly number[],
): OptionNotes | undefined {
	const notes: OptionNotes = {};
	for (const index of selected) {
		const note = stored[String(index)];
		if (note !== undefined) notes[String(index)] = note;
	}
	return Object.keys(notes).length === 0 ? undefined : notes;
}

function move(session: Session, delta: number): Session {
	const count = rowCount(session);
	const next = Math.min(count - 1, Math.max(0, focusRow(session) + delta));
	return { ...session, focus: focusAt(session, next) };
}

/** 行数 = 选项 + Custom（+ 多选题的 Confirm）。 */
function rowCount(session: Session): number {
	const question = session.questions[session.active];
	return question.options.length + (question.multiple ? 2 : 1);
}

function focusRow(session: Session): number {
	const options = session.questions[session.active].options.length;
	if (session.focus.kind === "option") return session.focus.index;
	return session.focus.kind === "custom" ? options : options + 1;
}

function focusAt(session: Session, row: number): Focus {
	const options = session.questions[session.active].options.length;
	if (row < options) return { kind: "option", index: row };
	return row === options ? { kind: "custom" } : { kind: "confirm" };
}

function switchQuestion(session: Session, delta: number): Session {
	const count = session.questions.length;
	if (count < 2) return session;
	const active = (session.active + delta + count) % count;
	return { ...session, active, focus: { kind: "option", index: 0 } };
}

function confirm(session: Session): Session {
	if (session.focus.kind === "custom") {
		const initial =
			session.customs[session.active] || session.customDrafts[session.active];
		return { ...session, phase: { kind: "custom", initial } };
	}
	if (session.focus.kind === "confirm") return advance(session);
	// 多选的 Enter 就是勾选，收题走 Confirm 行，避免一按 Enter 跳过本题。
	if (session.questions[session.active].multiple)
		return toggleOption(session, session.focus.index);
	return advance(select(session, session.focus.index));
}

function pickDigit(session: Session, value: number): Session {
	const index = value - 1;
	if (index < 0 || index >= session.questions[session.active].options.length)
		return session;
	if (session.questions[session.active].multiple)
		return toggleOption(session, index);
	return advance(select(session, index));
}

function select(session: Session, index: number): Session {
	const selected = session.selected.map((entry) => [...entry]);
	const previous = selected[session.active][0];
	selected[session.active] = [index];
	const optionNotes = copyNotes(session.optionNotes);
	if (previous !== undefined && previous !== index)
		delete optionNotes[session.active][String(previous)];
	return { ...session, selected, optionNotes };
}

function toggleOption(session: Session, index: number): Session {
	const selected = session.selected.map((entry) => [...entry]);
	const current = selected[session.active];
	const checked = current.includes(index);
	selected[session.active] = checked
		? current.filter((entry) => entry !== index)
		: [...current, index].sort((a, b) => a - b);
	const optionNotes = copyNotes(session.optionNotes);
	const noteDrafts = copyNotes(session.noteDrafts);
	if (checked) {
		// 取消勾选就把它那条 note 连同草稿一起丢掉，别留着下次按 e 又冒出来。
		delete optionNotes[session.active][String(index)];
		delete noteDrafts[session.active][String(index)];
	}
	return { ...session, selected, optionNotes, noteDrafts };
}

function annotate(session: Session): Session {
	if (session.focus.kind !== "option") return session;
	const option = session.focus.index;
	const key = String(option);
	const settled = session.optionNotes[session.active][key] ?? "";
	const draft = session.noteDrafts[session.active][key] ?? "";
	return {
		...session,
		phase: { kind: "note", option, initial: settled || draft },
	};
}

/**
 * note 落在选项上：单选一题只留一条、落地就推进；多选每条跟着自己的选项，
 * 落地只保证该选项勾上，焦点留在列表继续操作。
 */
function commitNote(session: Session, text: string): Session {
	if (session.phase.kind !== "note") return session;
	const question = session.questions[session.active];
	const option = session.phase.option;
	const note = text.trim();
	const selected = session.selected.map((entry) => [...entry]);
	selected[session.active] = question.multiple
		? [...new Set([...selected[session.active], option])].sort((a, b) => a - b)
		: [option];
	const optionNotes = copyNotes(session.optionNotes);
	const noteDrafts = copyNotes(session.noteDrafts);
	// 单选只可能有选中项那一条，其他选项的旧 note 顺带清掉。
	if (!question.multiple) optionNotes[session.active] = {};
	setNote(optionNotes[session.active], String(option), note);
	setNote(noteDrafts[session.active], String(option), note);
	const next: Session = {
		...session,
		selected,
		optionNotes,
		noteDrafts,
		focus: { kind: "option", index: option },
		phase: { kind: "list" },
	};
	return question.multiple ? next : advance(next);
}

function cancelNote(session: Session, text: string): Session {
	if (session.phase.kind !== "note") return session;
	const noteDrafts = copyNotes(session.noteDrafts);
	setNote(noteDrafts[session.active], String(session.phase.option), text);
	return {
		...session,
		noteDrafts,
		focus: { kind: "option", index: session.phase.option },
		phase: { kind: "list" },
	};
}

function copyNotes(notes: OptionNotes[]): OptionNotes[] {
	return notes.map((entry) => ({ ...entry }));
}

/** 空白就是清掉这条，别留空串让界面渲染出一个空的补充行。 */
function setNote(entry: OptionNotes, key: string, text: string): void {
	if (text.trim() === "") delete entry[key];
	else entry[key] = text.trim();
}

function commitCustom(session: Session, text: string): Session {
	if (session.phase.kind !== "custom") return session;
	const custom = text.trim();
	const customs = [...session.customs];
	customs[session.active] = custom;
	const customDrafts = [...session.customDrafts];
	customDrafts[session.active] = custom;
	const next: Session = {
		...session,
		customs,
		customDrafts,
		focus: { kind: "custom" },
		phase: { kind: "list" },
	};
	return custom === "" ? next : advance(next);
}

function cancelCustom(session: Session, text: string): Session {
	if (session.phase.kind !== "custom") return session;
	const customDrafts = [...session.customDrafts];
	customDrafts[session.active] = text;
	return { ...session, customDrafts, phase: { kind: "list" } };
}

/** 跳到下一道没结论的题；都答完了就提交。Confirm 跳过当前题时也算收尾。 */
function advance(session: Session): Session {
	const count = session.questions.length;
	for (let step = 1; step < count; step += 1) {
		const candidate = (session.active + step) % count;
		if (isAnswered(session, candidate)) continue;
		return {
			...session,
			active: candidate,
			focus: { kind: "option", index: 0 },
			phase: { kind: "list" },
		};
	}
	return submit(session);
}

function submit(session: Session): Session {
	const answers = buildAnswers(session);
	if (answers.length === 0) return session;
	return done(session, {
		kind: "submit",
		answers,
		skipped: session.questions
			.map((_question, index) => index)
			.filter((index) => !isAnswered(session, index)),
	});
}

function submitEarly(session: Session): Session {
	return submit(session);
}

function done(session: Session, outcome: Outcome): Session {
	return { ...session, phase: { kind: "done", outcome } };
}
