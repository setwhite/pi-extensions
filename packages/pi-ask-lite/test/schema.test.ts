import { describe, expect, it } from "vitest";
import type { AskLimits } from "../src/schema.ts";
import { parseAskInput } from "../src/schema.ts";

const limits: AskLimits = { maxQuestions: 4, maxOptions: 6 };

const question = {
	question: "Which approach?",
	options: [{ label: "A" }, { label: "B" }],
};

describe("parseAskInput", () => {
	it("把最小输入解析成强类型，multiple 缺省 false", () => {
		expect(parseAskInput({ questions: [question] }, limits)).toEqual([
			{
				question: "Which approach?",
				multiple: false,
				options: [{ label: "A" }, { label: "B" }],
			},
		]);
	});

	it("保留多题、多选、title、detail 与 preview", () => {
		const parsed = parseAskInput(
			{
				questions: [
					{
						title: "Step 1",
						question: "Pick one",
						options: [{ label: "A", detail: "a" }, { label: "B" }],
					},
					{
						question: "Pick many",
						multiple: true,
						options: [{ label: "C", preview: "# C" }, { label: "D" }],
					},
				],
			},
			limits,
		);
		expect(parsed).toHaveLength(2);
		expect(parsed[0]).toMatchObject({ title: "Step 1", multiple: false });
		expect(parsed[1]?.multiple).toBe(true);
		expect(parsed[1]?.options[0]).toEqual({ label: "C", preview: "# C" });
	});

	it("去掉 label 与 question 前后的空白，空白 title 当作没写", () => {
		const parsed = parseAskInput(
			{
				questions: [
					{
						title: "  ",
						question: "  Q  ",
						options: [{ label: "  A  " }, { label: "B" }],
					},
				],
			},
			limits,
		);
		expect(parsed[0]).toEqual({
			question: "Q",
			multiple: false,
			options: [{ label: "A" }, { label: "B" }],
		});
	});

	it("允许 Other 与 Next 当 label", () => {
		const parsed = parseAskInput(
			{
				questions: [
					{ question: "Q", options: [{ label: "Other" }, { label: "Next" }] },
				],
			},
			limits,
		);
		expect(parsed[0]?.options.map((option) => option.label)).toEqual([
			"Other",
			"Next",
		]);
	});

	it("1 题 2 选项与 4 题 6 选项都通过", () => {
		const wide = {
			questions: Array.from({ length: 4 }, () => ({
				question: "Q",
				options: Array.from({ length: 6 }, (_, index) => ({
					label: `O${index}`,
				})),
			})),
		};
		expect(parseAskInput(wide, limits)).toHaveLength(4);
	});

	it("0 题、5 题、1 选项、7 选项都抛错并点出字段", () => {
		expect(() => parseAskInput({ questions: [] }, limits)).toThrow(
			/questions: expected at least 1/,
		);
		expect(() =>
			parseAskInput(
				{ questions: Array.from({ length: 5 }, () => question) },
				limits,
			),
		).toThrow(/questions: expected at most 4/);
		expect(() =>
			parseAskInput(
				{ questions: [{ question: "Q", options: [{ label: "A" }] }] },
				limits,
			),
		).toThrow(/questions\[0\]\.options: expected at least 2/);
		expect(() =>
			parseAskInput(
				{
					questions: [
						{
							question: "Q",
							options: Array.from({ length: 7 }, (_, index) => ({
								label: `O${index}`,
							})),
						},
					],
				},
				limits,
			),
		).toThrow(/questions\[0\]\.options: expected at most 6/);
	});

	it("空白 question 与空白 label 都抛错", () => {
		expect(() =>
			parseAskInput(
				{
					questions: [
						{ question: "   ", options: [{ label: "A" }, { label: "B" }] },
					],
				},
				limits,
			),
		).toThrow(/questions\[0\]\.question/);
		expect(() =>
			parseAskInput(
				{
					questions: [
						{ question: "Q", options: [{ label: " " }, { label: "B" }] },
					],
				},
				limits,
			),
		).toThrow(/questions\[0\]\.options\[0\]\.label/);
	});

	it("未知键与类型不符都抛错并带路径", () => {
		expect(() =>
			parseAskInput({ questions: [question], extra: 1 }, limits),
		).toThrow(/extra: unknown key/);
		expect(() =>
			parseAskInput({ questions: [{ ...question, dependsOn: [] }] }, limits),
		).toThrow(/questions\[0\]\.dependsOn: unknown key/);
		expect(() =>
			parseAskInput(
				{
					questions: [
						{
							...question,
							options: [{ label: "A", hint: "x" }, { label: "B" }],
						},
					],
				},
				limits,
			),
		).toThrow(/questions\[0\]\.options\[0\]\.hint: unknown key/);
		expect(() => parseAskInput({ questions: "nope" }, limits)).toThrow(
			/questions: expected an array, got string/,
		);
		expect(() =>
			parseAskInput({ questions: [{ ...question, multiple: "yes" }] }, limits),
		).toThrow(/questions\[0\]\.multiple: expected a boolean, got string/);
	});

	it("多个错误一次报完", () => {
		const error = (() => {
			try {
				parseAskInput(
					{ questions: [{ question: "", options: [] }], junk: true },
					limits,
				);
			} catch (thrown) {
				return thrown as Error;
			}
			return undefined;
		})();
		expect(error?.message).toMatch(/junk: unknown key/);
		expect(error?.message).toMatch(/questions\[0\]\.question/);
		expect(error?.message).toMatch(/options: expected at least 2/);
	});
});
