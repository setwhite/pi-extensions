import type { Question } from "./schema.ts";

export type Answer = {
	index: number;
	question: string;
	selected: number[];
	custom?: string;
	note?: string;
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
	notes: string[];
	noteDrafts: string[];
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
		notes: questions.map(() => ""),
		noteDrafts: questions.map(() => ""),
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
		const note = selected.length === 1 ? session.notes[index].trim() : "";
		const preview =
			selected.length > 0 ? question.options[selected[0]].preview : undefined;
		answers.push({
			index,
			question: question.question,
			selected,
			...(custom === "" ? {} : { custom }),
			...(note === "" ? {} : { note }),
			...(preview === undefined ? {} : { preview }),
		});
	}
	return answers;
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
	const notes = [...session.notes];
	const previous = selected[session.active][0];
	selected[session.active] = [index];
	if (previous !== undefined && previous !== index) notes[session.active] = "";
	return { ...session, selected, notes };
}

function toggleOption(session: Session, index: number): Session {
	const selected = session.selected.map((entry) => [...entry]);
	const current = selected[session.active];
	selected[session.active] = current.includes(index)
		? current.filter((entry) => entry !== index)
		: [...current, index].sort((a, b) => a - b);
	return { ...session, selected };
}

function annotate(session: Session): Session {
	if (session.focus.kind !== "option") return session;
	if (session.questions[session.active].multiple) return session;
	const option = session.focus.index;
	const settled = session.selected[session.active].includes(option)
		? session.notes[session.active]
		: "";
	return {
		...session,
		phase: {
			kind: "note",
			option,
			initial: settled || session.noteDrafts[session.active],
		},
	};
}

function commitNote(session: Session, text: string): Session {
	if (session.phase.kind !== "note") return session;
	const note = text.trim();
	const selected = session.selected.map((entry) => [...entry]);
	selected[session.active] = [session.phase.option];
	const notes = [...session.notes];
	notes[session.active] = note;
	const noteDrafts = [...session.noteDrafts];
	noteDrafts[session.active] = note;
	return advance({
		...session,
		selected,
		notes,
		noteDrafts,
		focus: { kind: "option", index: session.phase.option },
		phase: { kind: "list" },
	});
}

function cancelNote(session: Session, text: string): Session {
	if (session.phase.kind !== "note") return session;
	const noteDrafts = [...session.noteDrafts];
	noteDrafts[session.active] = text;
	return {
		...session,
		noteDrafts,
		focus: { kind: "option", index: session.phase.option },
		phase: { kind: "list" },
	};
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
