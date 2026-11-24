import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export type Config = {
	tools: { ask: { name: string } };
	limits: { maxQuestions: number; maxOptions: number };
	ui: {
		maxHeightRatio: number;
		bell: boolean;
		preview: { minSideBySideWidth: number };
	};
	keys: { annotate: string; submitEarly: string };
	guidance: {
		description: string;
		promptSnippet: string;
		promptGuidelines: string[];
	};
};

export type LoadOptions = {
	configPath?: string;
	env?: NodeJS.ProcessEnv;
};

export const DEFAULTS: Config = {
	tools: { ask: { name: "ask" } },
	limits: { maxQuestions: 4, maxOptions: 6 },
	ui: {
		maxHeightRatio: 0.45,
		bell: true,
		preview: { minSideBySideWidth: 100 },
	},
	keys: { annotate: "e", submitEarly: "ctrl+enter" },
	guidance: {
		description:
			"Ask structured questions when user intent or trade-offs are unclear.",
		promptSnippet: "",
		promptGuidelines: [
			"tool-name: Check code, docs, or tools first; only ask when user intent or trade-offs are unclear.",
			"tool-name: Ask only independent questions together; defer follow-ups that depend on earlier answers.",
			"tool-name: Put the recommended option first, keep `label` short, and explain trade-offs in `detail`.",
			"tool-name: Put concrete examples, code, or layouts in `preview` when options differ in behavior.",
			"tool-name: Set `multiple: true` only when choices are not mutually exclusive.",
		],
	},
};

const MIN_HEIGHT_RATIO = 0.2;
const MAX_HEIGHT_RATIO = 0.8;
const TOOL_NAME = /^[A-Za-z][A-Za-z0-9_]*$/;

export function resolveConfigPath(options: LoadOptions = {}): string {
	if (options.configPath !== undefined) return resolve(options.configPath);
	const env = options.env ?? process.env;
	const agentDir = env.PI_CODING_AGENT_DIR
		? resolve(env.PI_CODING_AGENT_DIR)
		: join(homedir(), ".pi", "agent");
	return join(agentDir, "pi-ask", "config.json");
}

export function loadConfig(options: LoadOptions = {}): Config {
	const path = resolveConfigPath(options);
	const source = readConfigFile(path);
	if (source === undefined) return structuredClone(DEFAULTS);

	let parsed: unknown;
	try {
		parsed = JSON.parse(source);
	} catch (error) {
		throw new Error(
			`pi-ask config ${path}: invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
		);
	}

	const errors: string[] = [];
	const config = buildConfig(parsed, errors);
	if (errors.length > 0)
		throw new Error(`pi-ask config ${path}: ${errors.join("\n")}`);
	return config;
}

type Raw = Record<string, unknown>;

function readConfigFile(path: string): string | undefined {
	try {
		return readFileSync(path, "utf-8");
	} catch (error) {
		if (isRecord(error) && error.code === "ENOENT") return undefined;
		throw error;
	}
}

function buildConfig(input: unknown, errors: string[]): Config {
	if (!isRecord(input)) {
		errors.push(`expected object, got ${describe(input)}`);
		return structuredClone(DEFAULTS);
	}
	checkKeys(input, "", ["tools", "limits", "ui", "keys", "guidance"], errors);

	const tools = readGroup(input.tools, "tools", errors);
	checkKeys(tools, "tools", ["ask"], errors);
	const ask = readGroup(tools.ask, "tools.ask", errors);
	checkKeys(ask, "tools.ask", ["name"], errors);
	const name =
		readString(ask.name, "tools.ask.name", errors) ?? DEFAULTS.tools.ask.name;
	if (!TOOL_NAME.test(name))
		errors.push(`tools.ask.name: expected a tool name, got "${name}"`);

	const limits = readGroup(input.limits, "limits", errors);
	checkKeys(limits, "limits", ["maxQuestions", "maxOptions"], errors);
	const maxQuestions =
		readInteger(limits.maxQuestions, "limits.maxQuestions", errors, {
			min: 1,
		}) ?? DEFAULTS.limits.maxQuestions;
	const maxOptions =
		readInteger(limits.maxOptions, "limits.maxOptions", errors, { min: 2 }) ??
		DEFAULTS.limits.maxOptions;

	const ui = readGroup(input.ui, "ui", errors);
	checkKeys(ui, "ui", ["maxHeightRatio", "bell", "preview"], errors);
	const ratio = readNumber(ui.maxHeightRatio, "ui.maxHeightRatio", errors);
	const bell = readBoolean(ui.bell, "ui.bell", errors) ?? DEFAULTS.ui.bell;
	const preview = readGroup(ui.preview, "ui.preview", errors);
	checkKeys(preview, "ui.preview", ["minSideBySideWidth"], errors);
	const minSideBySideWidth =
		readInteger(
			preview.minSideBySideWidth,
			"ui.preview.minSideBySideWidth",
			errors,
			{
				min: 20,
			},
		) ?? DEFAULTS.ui.preview.minSideBySideWidth;

	const keys = readGroup(input.keys, "keys", errors);
	checkKeys(keys, "keys", ["annotate", "submitEarly"], errors);
	const annotate =
		readString(keys.annotate, "keys.annotate", errors) ??
		DEFAULTS.keys.annotate;
	const submitEarly =
		readString(keys.submitEarly, "keys.submitEarly", errors) ??
		DEFAULTS.keys.submitEarly;
	if (annotate.trim() === "") errors.push("keys.annotate: expected a key");
	if (submitEarly.trim() === "")
		errors.push("keys.submitEarly: expected a key");

	const guidance = readGroup(input.guidance, "guidance", errors);
	checkKeys(
		guidance,
		"guidance",
		["description", "promptSnippet", "promptGuidelines"],
		errors,
	);
	const description =
		readString(guidance.description, "guidance.description", errors) ??
		DEFAULTS.guidance.description;
	const promptSnippet =
		readString(guidance.promptSnippet, "guidance.promptSnippet", errors) ??
		DEFAULTS.guidance.promptSnippet;
	const promptGuidelines =
		readStringArray(
			guidance.promptGuidelines,
			"guidance.promptGuidelines",
			errors,
		) ?? DEFAULTS.guidance.promptGuidelines;

	return {
		tools: { ask: { name } },
		limits: { maxQuestions, maxOptions },
		ui: {
			maxHeightRatio: clampRatio(ratio ?? DEFAULTS.ui.maxHeightRatio),
			bell,
			preview: { minSideBySideWidth },
		},
		keys: { annotate, submitEarly },
		guidance: { description, promptSnippet, promptGuidelines },
	};
}

/** 越界夹到区间，不报错：显示比例是口味问题，不是配置错误。 */
function clampRatio(value: number): number {
	return Math.min(MAX_HEIGHT_RATIO, Math.max(MIN_HEIGHT_RATIO, value));
}

function readGroup(value: unknown, path: string, errors: string[]): Raw {
	if (value === undefined) return {};
	if (!isRecord(value)) {
		errors.push(`${path}: expected object, got ${describe(value)}`);
		return {};
	}
	return value;
}

function readString(
	value: unknown,
	path: string,
	errors: string[],
): string | undefined {
	if (value === undefined) return undefined;
	if (typeof value !== "string") {
		errors.push(`${path}: expected string, got ${describe(value)}`);
		return undefined;
	}
	return value;
}

function readBoolean(
	value: unknown,
	path: string,
	errors: string[],
): boolean | undefined {
	if (value === undefined) return undefined;
	if (typeof value !== "boolean") {
		errors.push(`${path}: expected boolean, got ${describe(value)}`);
		return undefined;
	}
	return value;
}

function readNumber(
	value: unknown,
	path: string,
	errors: string[],
): number | undefined {
	if (value === undefined) return undefined;
	if (typeof value !== "number" || !Number.isFinite(value)) {
		errors.push(`${path}: expected number, got ${describe(value)}`);
		return undefined;
	}
	return value;
}

function readInteger(
	value: unknown,
	path: string,
	errors: string[],
	options: { min: number },
): number | undefined {
	const number = readNumber(value, path, errors);
	if (number === undefined) return undefined;
	if (!Number.isInteger(number) || number < options.min) {
		errors.push(`${path}: expected integer >= ${options.min}, got ${number}`);
		return undefined;
	}
	return number;
}

function readStringArray(
	value: unknown,
	path: string,
	errors: string[],
): string[] | undefined {
	if (value === undefined) return undefined;
	if (!Array.isArray(value)) {
		errors.push(`${path}: expected array, got ${describe(value)}`);
		return undefined;
	}
	const items: string[] = [];
	for (const [index, item] of value.entries()) {
		if (typeof item !== "string") {
			errors.push(`${path}[${index}]: expected string, got ${describe(item)}`);
			continue;
		}
		items.push(item);
	}
	return items;
}

function checkKeys(
	input: Raw,
	path: string,
	allowed: readonly string[],
	errors: string[],
): void {
	const prefix = path === "" ? "" : `${path}.`;
	for (const key of Object.keys(input)) {
		if (!allowed.includes(key)) errors.push(`${prefix}${key}: unknown key`);
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
