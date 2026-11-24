/** 工具入参解析。出口即契约：下游拿到的 Question[] 不再校验。 */

export type Option = {
	label: string;
	detail?: string;
	preview?: string;
};

export type Question = {
	title?: string;
	question: string;
	multiple: boolean;
	options: Option[];
};

export type AskLimits = {
	maxQuestions: number;
	maxOptions: number;
};

const TOP_KEYS = ["questions"];
const QUESTION_KEYS = ["title", "question", "multiple", "options"];
const OPTION_KEYS = ["label", "detail", "preview"];

type Errors = string[];

type Raw = Record<string, unknown>;

export function parseAskInput(input: unknown, limits: AskLimits): Question[] {
	const errors: Errors = [];
	const questions = parseQuestions(input, limits, errors);
	if (errors.length > 0) throw new Error(`pi-ask: ${errors.join("\n")}`);
	return questions;
}

function parseQuestions(
	input: unknown,
	limits: AskLimits,
	errors: Errors,
): Question[] {
	if (!isRecord(input)) {
		errors.push(`expected an object with questions[], got ${describe(input)}`);
		return [];
	}
	checkKeys(input, "", TOP_KEYS, errors);

	const raw = input.questions;
	if (!Array.isArray(raw)) {
		errors.push(`questions: expected an array, got ${describe(raw)}`);
		return [];
	}
	if (raw.length < 1) {
		errors.push("questions: expected at least 1 question");
		return [];
	}
	if (raw.length > limits.maxQuestions) {
		errors.push(
			`questions: expected at most ${limits.maxQuestions} questions, got ${raw.length}`,
		);
	}

	return raw.map((item, index) =>
		parseQuestion(item, `questions[${index}]`, limits, errors),
	);
}

function parseQuestion(
	input: unknown,
	path: string,
	limits: AskLimits,
	errors: Errors,
): Question {
	const fallback: Question = {
		question: "",
		multiple: false,
		options: [],
	};
	if (!isRecord(input)) {
		errors.push(`${path}: expected an object, got ${describe(input)}`);
		return fallback;
	}
	checkKeys(input, path, QUESTION_KEYS, errors);

	const question = readRequiredText(input.question, `${path}.question`, errors);
	const title = readText(input.title, `${path}.title`, errors);
	const multiple =
		readBoolean(input.multiple, `${path}.multiple`, errors) ?? false;
	const options = parseOptions(
		input.options,
		`${path}.options`,
		limits,
		errors,
	);

	return {
		...(title === undefined ? {} : { title }),
		question,
		multiple,
		options,
	};
}

function parseOptions(
	input: unknown,
	path: string,
	limits: AskLimits,
	errors: Errors,
): Option[] {
	if (!Array.isArray(input)) {
		errors.push(`${path}: expected an array, got ${describe(input)}`);
		return [];
	}
	if (input.length < 2) {
		errors.push(`${path}: expected at least 2 options, got ${input.length}`);
	}
	if (input.length > limits.maxOptions) {
		errors.push(
			`${path}: expected at most ${limits.maxOptions} options, got ${input.length}`,
		);
	}
	if (input.length > 9) {
		// 数字热键只有 1-9；再多的选项只能靠方向键，允许但界面不承诺热键。
	}
	return input.map((item, index) =>
		parseOption(item, `${path}[${index}]`, errors),
	);
}

function parseOption(input: unknown, path: string, errors: Errors): Option {
	const fallback: Option = { label: "" };
	if (!isRecord(input)) {
		errors.push(`${path}: expected an object, got ${describe(input)}`);
		return fallback;
	}
	checkKeys(input, path, OPTION_KEYS, errors);

	const label = readRequiredText(input.label, `${path}.label`, errors);
	const detail = readText(input.detail, `${path}.detail`, errors);
	const preview = readText(input.preview, `${path}.preview`, errors, {
		trim: false,
	});

	return {
		label,
		...(detail === undefined ? {} : { detail }),
		...(preview === undefined ? {} : { preview }),
	};
}

/** 必填文本：字符串、去空白后非空。缺字段与全空白都算错。 */
function readRequiredText(
	value: unknown,
	path: string,
	errors: Errors,
): string {
	if (value === undefined) {
		errors.push(`${path}: expected a non-empty string`);
		return "";
	}
	if (typeof value !== "string") {
		errors.push(`${path}: expected a string, got ${describe(value)}`);
		return "";
	}
	const text = value.trim();
	if (text === "") {
		errors.push(`${path}: expected a non-empty string`);
		return "";
	}
	return text;
}

/** 可选文本：类型不对算错，空串与全空白当作没写。 */
function readText(
	value: unknown,
	path: string,
	errors: Errors,
	options: { trim?: boolean } = {},
): string | undefined {
	if (value === undefined) return undefined;
	if (typeof value !== "string") {
		errors.push(`${path}: expected a string, got ${describe(value)}`);
		return undefined;
	}
	const text = options.trim === false ? value : value.trim();
	if (text.trim() === "") return undefined;
	return text;
}

function readBoolean(
	value: unknown,
	path: string,
	errors: Errors,
): boolean | undefined {
	if (value === undefined) return undefined;
	if (typeof value !== "boolean") {
		errors.push(`${path}: expected a boolean, got ${describe(value)}`);
		return undefined;
	}
	return value;
}

function checkKeys(
	input: Raw,
	path: string,
	allowed: readonly string[],
	errors: Errors,
): void {
	const prefix = path === "" ? "" : `${path}.`;
	for (const key of Object.keys(input)) {
		if (allowed.includes(key)) continue;
		errors.push(`${prefix}${key}: unknown key`);
	}
}

function isRecord(value: unknown): value is Raw {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function describe(value: unknown): string {
	if (value === null) return "null";
	if (Array.isArray(value)) return "array";
	return typeof value;
}
