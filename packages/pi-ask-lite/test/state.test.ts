import { describe, expect, it } from "vitest";
import type { Question } from "../src/schema.ts";
import type { Action, Outcome, Session } from "../src/state.ts";
import { createSession, isAnswered, reduce } from "../src/state.ts";

function question(text: string, labels: string[], multiple = false): Question {
	return {
		question: text,
		multiple,
		options: labels.map((label) => ({ label })),
	};
}

const single = () => createSession([question("Pick one", ["A", "B", "C"])]);
const pair = () =>
	createSession([
		question("First", ["A", "B"]),
		question("Second", ["C", "D"], true),
	]);

function apply(session: Session, ...actions: Action[]): Session {
	return actions.reduce(reduce, session);
}

function outcome(session: Session): Outcome {
	if (session.phase.kind !== "done") throw new Error("session is not done");
	return session.phase.outcome;
}

function submitted(session: Session) {
	const result = outcome(session);
	if (result.kind !== "submit") throw new Error("session did not submit");
	return result;
}

describe("reduce 初始状态", () => {
	it("光标在第一题第一个选项", () => {
		const session = single();
		expect(session.active).toBe(0);
		expect(session.focus).toEqual({ kind: "option", index: 0 });
		expect(session.phase).toEqual({ kind: "list" });
	});
});

describe("光标", () => {
	it("单选最后一行是 Custom，上下夹在两端", () => {
		let session = single();
		session = apply(session, { kind: "up" });
		expect(session.focus).toEqual({ kind: "option", index: 0 });
		session = apply(
			session,
			{ kind: "down" },
			{ kind: "down" },
			{ kind: "down" },
		);
		expect(session.focus).toEqual({ kind: "custom" });
		session = apply(session, { kind: "down" });
		expect(session.focus).toEqual({ kind: "custom" });
	});

	it("多选在 Custom 下方多一行 Confirm", () => {
		let session = createSession([question("Pick many", ["A", "B"], true)]);
		session = apply(session, { kind: "down" }, { kind: "down" });
		expect(session.focus).toEqual({ kind: "custom" });
		session = apply(session, { kind: "down" });
		expect(session.focus).toEqual({ kind: "confirm" });
		session = apply(session, { kind: "down" });
		expect(session.focus).toEqual({ kind: "confirm" });
	});
});

describe("单选", () => {
	it("Enter 选中当前项并提交", () => {
		const session = apply(single(), { kind: "confirm" });
		expect(outcome(session)).toEqual({
			kind: "submit",
			answers: [{ index: 0, question: "Pick one", selected: [0] }],
			skipped: [],
		});
	});

	it("数字直接选中并提交，越界数字忽略", () => {
		expect(outcome(apply(single(), { kind: "digit", value: 3 }))).toMatchObject(
			{
				answers: [{ selected: [2] }],
			},
		);
		expect(apply(single(), { kind: "digit", value: 9 }).phase).toEqual({
			kind: "list",
		});
	});
});

describe("多选", () => {
	it("Enter 勾选当前项不推进，Confirm 行才收题", () => {
		let session = pair();
		session = apply(session, { kind: "confirm" });
		expect(session.active).toBe(1);
		session = apply(session, { kind: "confirm" });
		expect(session.selected[1]).toEqual([0]);
		expect(session.active).toBe(1);
		session = apply(session, { kind: "down" }, { kind: "confirm" });
		expect(session.selected[1]).toEqual([0, 1]);
		session = apply(
			session,
			{ kind: "down" },
			{ kind: "down" },
			{ kind: "confirm" },
		);
		expect(outcome(session)).toMatchObject({
			answers: [{ selected: [0] }, { selected: [0, 1] }],
			skipped: [],
		});
	});

	it("数字在多选下切换勾选，不推进", () => {
		let session = createSession([question("Pick many", ["A", "B"], true)]);
		session = apply(session, { kind: "digit", value: 2 });
		expect(session.selected[0]).toEqual([1]);
		expect(session.phase).toEqual({ kind: "list" });
	});

	it("空着走 Confirm 收尾时把该题记进 skipped", () => {
		let session = pair();
		session = apply(session, { kind: "confirm" });
		expect(session.active).toBe(1);
		session = apply(
			session,
			{ kind: "down" },
			{ kind: "down" },
			{ kind: "down" },
			{ kind: "confirm" },
		);
		expect(outcome(session)).toEqual({
			kind: "submit",
			answers: [{ index: 0, question: "First", selected: [0] }],
			skipped: [1],
		});
	});

	it("单题多选空着 Confirm 不提交", () => {
		let session = createSession([question("Pick many", ["A", "B"], true)]);
		session = apply(
			session,
			{ kind: "down" },
			{ kind: "down" },
			{ kind: "down" },
			{ kind: "confirm" },
		);
		expect(session.phase).toEqual({ kind: "list" });
	});
});

describe("推进", () => {
	it("Tab 切题并循环，单题不动", () => {
		let session = pair();
		session = apply(session, { kind: "nextQuestion" });
		expect(session.active).toBe(1);
		session = apply(session, { kind: "nextQuestion" });
		expect(session.active).toBe(0);
		session = apply(session, { kind: "prevQuestion" });
		expect(session.active).toBe(1);
		expect(apply(single(), { kind: "nextQuestion" }).active).toBe(0);
	});

	it("答完一题跳到下一道未答；最后一题先答完也会跳回漏题", () => {
		let session = pair();
		session = apply(session, { kind: "nextQuestion" }, { kind: "confirm" });
		session = apply(
			session,
			{ kind: "down" },
			{ kind: "down" },
			{ kind: "down" },
			{ kind: "confirm" },
		);
		expect(session.active).toBe(0);
		session = apply(session, { kind: "confirm" });
		expect(outcome(session).kind).toBe("submit");
	});
});

describe("折叠", () => {
	it("toggleCollapse 只翻渲染标志，焦点、答案与草稿都不动", () => {
		let session = apply(pair(), { kind: "annotate" });
		session = apply(session, { kind: "cancelNote", text: "草稿" });
		session = apply(session, { kind: "confirm" }, { kind: "confirm" });
		expect(session.selected).toEqual([[0], [0]]);
		expect(session.noteDrafts[0]).toEqual({ "0": "草稿" });
		const collapsed = apply(session, { kind: "toggleCollapse" });
		expect(collapsed.collapsed).toBe(true);
		expect(collapsed.focus).toEqual(session.focus);
		expect(collapsed.noteDrafts).toEqual(session.noteDrafts);
		expect(apply(collapsed, { kind: "toggleCollapse" }).collapsed).toBe(false);
	});

	it("折叠时别的动作不生效，Esc 仍能中止", () => {
		const session = apply(pair(), { kind: "toggleCollapse" });
		expect(apply(session, { kind: "confirm" })).toBe(session);
		expect(apply(session, { kind: "down" })).toBe(session);
		expect(apply(session, { kind: "submitEarly" })).toBe(session);
		expect(outcome(apply(session, { kind: "escape" }))).toEqual({
			kind: "abort",
		});
	});

	it("note 编辑中按 collapse 不折叠", () => {
		const session = apply(single(), { kind: "annotate" });
		expect(apply(session, { kind: "toggleCollapse" }).collapsed).toBe(false);
	});
});

describe("提前提交", () => {
	it("只交已答的题，未答的进 skipped", () => {
		let session = pair();
		session = apply(session, { kind: "confirm" }, { kind: "submitEarly" });
		expect(outcome(session)).toEqual({
			kind: "submit",
			answers: [{ index: 0, question: "First", selected: [0] }],
			skipped: [1],
		});
	});

	it("一题都没答时不动作", () => {
		expect(apply(pair(), { kind: "submitEarly" }).phase).toEqual({
			kind: "list",
		});
	});
});

describe("补充说明", () => {
	it("e 进编辑，Enter 落地并选中该选项", () => {
		let session = apply(single(), { kind: "down" }, { kind: "annotate" });
		expect(session.phase).toEqual({ kind: "note", option: 1, initial: "" });
		session = apply(session, { kind: "commitNote", text: "  选 B 的原因  " });
		expect(outcome(session)).toEqual({
			kind: "submit",
			answers: [
				{ index: 0, question: "Pick one", selected: [1], note: "选 B 的原因" },
			],
			skipped: [],
		});
	});

	it("Esc 退出编辑只留草稿，题仍未答", () => {
		let session = apply(single(), { kind: "annotate" });
		session = apply(session, { kind: "cancelNote", text: "半句" });
		expect(session.phase).toEqual({ kind: "list" });
		expect(session.optionNotes[0]).toEqual({});
		expect(session.noteDrafts[0]).toEqual({ "0": "半句" });
		expect(isAnswered(session, 0)).toBe(false);
		session = apply(session, { kind: "annotate" });
		expect(session.phase).toEqual({ kind: "note", option: 0, initial: "半句" });
	});

	it("多选 e 进编辑，Enter 自动勾上该选项、焦点留在列表", () => {
		let session = createSession([question("Many", ["A", "B"], true)]);
		session = apply(session, { kind: "down" }, { kind: "annotate" });
		expect(session.phase).toEqual({ kind: "note", option: 1, initial: "" });
		session = apply(session, { kind: "commitNote", text: "B 的理由" });
		expect(session.phase).toEqual({ kind: "list" });
		expect(session.selected[0]).toEqual([1]);
		expect(session.focus).toEqual({ kind: "option", index: 1 });
		expect(session.optionNotes[0]).toEqual({ "1": "B 的理由" });
	});

	it("多选每个选项各记一条 note，取消勾选就清掉那一条", () => {
		let session = createSession([question("Many", ["A", "B"], true)]);
		session = apply(
			session,
			{ kind: "annotate" },
			{ kind: "commitNote", text: "A 的理由" },
			{ kind: "down" },
			{ kind: "annotate" },
			{ kind: "commitNote", text: "B 的理由" },
		);
		expect(session.optionNotes[0]).toEqual({
			"0": "A 的理由",
			"1": "B 的理由",
		});
		session = apply(session, { kind: "digit", value: 1 });
		expect(session.selected[0]).toEqual([1]);
		expect(session.optionNotes[0]).toEqual({ "1": "B 的理由" });
		session = apply(
			session,
			{ kind: "down" },
			{ kind: "down" },
			{ kind: "down" },
			{ kind: "confirm" },
		);
		const answer = submitted(session).answers[0];
		expect(answer).toMatchObject({ selected: [1], notes: { "1": "B 的理由" } });
		expect(answer).not.toHaveProperty("note");
	});

	it("多选 note 的草稿按选项分开，Esc 后带回自己那条", () => {
		let session = createSession([question("Many", ["A", "B"], true)]);
		session = apply(
			session,
			{ kind: "annotate" },
			{ kind: "cancelNote", text: "A 半句" },
			{ kind: "down" },
			{ kind: "annotate" },
		);
		expect(session.phase).toEqual({ kind: "note", option: 1, initial: "" });
		session = apply(session, { kind: "cancelNote", text: "B 半句" });
		session = apply(session, { kind: "up" }, { kind: "annotate" });
		expect(session.phase).toEqual({
			kind: "note",
			option: 0,
			initial: "A 半句",
		});
	});

	it("改选别的选项会丢掉旧 note", () => {
		let session = createSession([
			question("First", ["A", "B"]),
			question("Second", ["C", "D"]),
		]);
		session = apply(
			session,
			{ kind: "annotate" },
			{ kind: "commitNote", text: "A 的理由" },
		);
		expect(session.optionNotes[0]).toEqual({ "0": "A 的理由" });
		expect(session.active).toBe(1);

		session = apply(session, { kind: "prevQuestion" });
		expect(session.active).toBe(0);
		session = apply(session, { kind: "digit", value: 2 });
		expect(session.optionNotes[0]).toEqual({});
		expect(session.active).toBe(1);

		session = apply(session, { kind: "confirm" });
		const answer = submitted(session).answers[0];
		expect(answer).toMatchObject({ index: 0, selected: [1] });
		expect(answer).not.toHaveProperty("note");
	});
});

describe("自由输入", () => {
	it("Enter 进编辑带出草稿，提交后和勾选并存", () => {
		let session = createSession([question("Many", ["A", "B"], true)]);
		session = apply(
			session,
			{ kind: "confirm" },
			{ kind: "down" },
			{ kind: "down" },
			{ kind: "confirm" },
		);
		expect(session.phase).toEqual({ kind: "custom", initial: "" });
		session = apply(session, { kind: "commitCustom", text: "  再加一条  " });
		expect(submitted(session).answers[0]).toMatchObject({
			selected: [0],
			custom: "再加一条",
		});
	});

	it("空白提交只清掉文本，不推进", () => {
		let session = pair();
		session = apply(
			session,
			{ kind: "down" },
			{ kind: "down" },
			{ kind: "confirm" },
			{ kind: "commitCustom", text: "先写" },
		);
		expect(session.active).toBe(1);
		session = apply(
			session,
			{ kind: "nextQuestion" },
			{ kind: "down" },
			{ kind: "down" },
			{ kind: "confirm" },
			{ kind: "commitCustom", text: "   " },
		);
		expect(session.phase).toEqual({ kind: "list" });
		expect(session.active).toBe(0);
		expect(session.customs[0]).toBe("");
	});

	it("Esc 退出编辑保留草稿", () => {
		let session = apply(
			single(),
			{ kind: "down" },
			{ kind: "down" },
			{ kind: "down" },
			{ kind: "confirm" },
		);
		expect(session.phase).toEqual({ kind: "custom", initial: "" });
		session = apply(session, { kind: "cancelCustom", text: "写了一半" });
		expect(session.customDrafts[0]).toBe("写了一半");
		expect(isAnswered(session, 0)).toBe(false);
	});
});

describe("中止与收尾", () => {
	it("列表态 Esc 整次放弃，已答的也丢", () => {
		let session = pair();
		session = apply(session, { kind: "confirm" }, { kind: "escape" });
		expect(outcome(session)).toEqual({ kind: "abort" });
		expect(outcome(session)).not.toHaveProperty("answers");
	});

	it("进 done 之后输入全部忽略，出口只出一次", () => {
		let session = apply(single(), { kind: "escape" });
		const first = outcome(session);
		session = apply(session, { kind: "confirm" }, { kind: "escape" });
		expect(outcome(session)).toBe(first);
	});

	it("编辑态的 escape 动作不改相位", () => {
		const session = apply(single(), { kind: "annotate" }, { kind: "escape" });
		expect(session.phase).toMatchObject({ kind: "note" });
	});
});
