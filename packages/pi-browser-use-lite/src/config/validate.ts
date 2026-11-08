/**
 * 配置校验：逐字段检查类型与枚举，数值越界 clamp。
 * 每个字段非法时记一条 `<field path>: <reason>` 并回退默认值，收集完由 index.ts 统一抛出。
 */

import { join } from "node:path";
import {
	CONFIG_SUBPATH,
	DEFAULTS,
	type Errors,
	GUIDANCE_KEYS,
	type GuidanceFields,
	RANGES,
	type Raw,
	RESERVED_TOOL_NAMES,
	type ResolvedConfig,
	SCREENSHOT_FORMATS,
	type ScreenshotFormat,
	TOOL_IDS,
	TOOL_NAME_PATTERN,
	type ToolId,
	type ToolSettings,
} from "./schema.ts";

const TOP_KEYS = [
	"bridge",
	"policy",
	"input",
	"timing",
	"output",
	"screenshot",
	"prompt",
	"tools",
	"guidance",
];

export function buildConfig(
	raw: Raw,
	agentDirPath: string,
	errors: Errors,
): ResolvedConfig {
	checkUnknownKeys(raw, TOP_KEYS, "", errors);
	const bridge = asObject(raw.bridge, "bridge", errors);
	checkUnknownKeys(bridge, ["port"], "bridge", errors);
	const policy = asObject(raw.policy, "policy", errors);
	checkUnknownKeys(
		policy,
		["authorizeOnStart", "background", "closeOwnTabsOnExit"],
		"policy",
		errors,
	);
	const input = asObject(raw.input, "input", errors);
	checkUnknownKeys(input, ["dragSteps", "scrollSteps"], "input", errors);
	const timing = asObject(raw.timing, "timing", errors);
	checkUnknownKeys(timing, ["navigateTimeoutMs"], "timing", errors);
	const output = asObject(raw.output, "output", errors);
	checkUnknownKeys(output, ["maxElements", "textChars"], "output", errors);
	const screenshot = asObject(raw.screenshot, "screenshot", errors);
	checkUnknownKeys(
		screenshot,
		["dir", "format", "keepNewest"],
		"screenshot",
		errors,
	);
	return {
		bridge: {
			port: readNumber(
				bridge.port,
				DEFAULTS.bridge.port,
				"bridge.port",
				errors,
				RANGES.port,
			),
		},
		policy: {
			authorizeOnStart: readBoolean(
				policy.authorizeOnStart,
				DEFAULTS.policy.authorizeOnStart,
				"policy.authorizeOnStart",
				errors,
			),
			background: readBoolean(
				policy.background,
				DEFAULTS.policy.background,
				"policy.background",
				errors,
			),
			closeOwnTabsOnExit: readBoolean(
				policy.closeOwnTabsOnExit,
				DEFAULTS.policy.closeOwnTabsOnExit,
				"policy.closeOwnTabsOnExit",
				errors,
			),
		},
		input: {
			dragSteps: readNumber(
				input.dragSteps,
				DEFAULTS.input.dragSteps,
				"input.dragSteps",
				errors,
				RANGES.dragSteps,
			),
			scrollSteps: readNumber(
				input.scrollSteps,
				DEFAULTS.input.scrollSteps,
				"input.scrollSteps",
				errors,
				RANGES.scrollSteps,
			),
		},
		timing: {
			navigateTimeoutMs: readNumber(
				timing.navigateTimeoutMs,
				DEFAULTS.timing.navigateTimeoutMs,
				"timing.navigateTimeoutMs",
				errors,
				RANGES.navigateTimeoutMs,
			),
		},
		output: {
			maxElements: readNumber(
				output.maxElements,
				DEFAULTS.output.maxElements,
				"output.maxElements",
				errors,
				RANGES.maxElements,
			),
			textChars: readNumber(
				output.textChars,
				DEFAULTS.output.textChars,
				"output.textChars",
				errors,
				RANGES.textChars,
			),
		},
		screenshot: {
			dir: readString(
				screenshot.dir,
				join(agentDirPath, CONFIG_SUBPATH, "screenshots"),
				"screenshot.dir",
				errors,
			),
			format: readEnum<ScreenshotFormat>(
				screenshot.format,
				SCREENSHOT_FORMATS,
				DEFAULTS.screenshot.format,
				"screenshot.format",
				errors,
			),
			keepNewest: readNumber(
				screenshot.keepNewest,
				DEFAULTS.screenshot.keepNewest,
				"screenshot.keepNewest",
				errors,
				RANGES.keepNewest,
			),
		},
		prompt: readPrompt(raw.prompt, errors),
		tools: readTools(raw.tools, errors),
		guidance: readGuidance(raw.guidance, errors),
	};
}

function readTools(
	value: unknown,
	errors: Errors,
): Record<ToolId, ToolSettings> {
	const raw = asObject(value, "tools", errors);
	checkUnknownKeys(raw, TOOL_IDS, "tools", errors);
	const tools = {} as Record<ToolId, ToolSettings>;
	for (const id of TOOL_IDS) {
		tools[id] = readToolSettings(raw[id], `tools.${id}`, id, errors);
	}
	if (!TOOL_IDS.some((id) => tools[id].enabled)) {
		errors.push(
			`tools: all ${TOOL_IDS.length} tools are disabled; keep at least one enabled`,
		);
	}
	const names = TOOL_IDS.map((id) => tools[id].name);
	const duplicated = names.find((name, index) => names.indexOf(name) !== index);
	if (duplicated !== undefined) {
		errors.push(
			`tools: two tools cannot share the same name ("${duplicated}")`,
		);
	}
	return tools;
}

function readToolSettings(
	value: unknown,
	path: string,
	defaultName: string,
	errors: Errors,
): ToolSettings {
	const raw = asObject(value, path, errors);
	checkUnknownKeys(raw, ["enabled", "name"], path, errors);
	const name = readString(raw.name, defaultName, `${path}.name`, errors);
	if (typeof raw.name === "string" && raw.name.trim() !== "") {
		if (!TOOL_NAME_PATTERN.test(name)) {
			errors.push(
				`${path}.name: must start with a lowercase letter and contain only lowercase letters, digits or "_", got ${JSON.stringify(name)}`,
			);
		} else if (RESERVED_TOOL_NAMES.has(name)) {
			errors.push(`${path}.name: "${name}" is reserved by the host`);
		}
	}
	return {
		enabled: readBoolean(raw.enabled, true, `${path}.enabled`, errors),
		name,
	};
}

function checkUnknownKeys(
	raw: Raw,
	allowed: readonly string[],
	path: string,
	errors: Errors,
): void {
	for (const key of Object.keys(raw)) {
		if (!allowed.includes(key))
			errors.push(`${path === "" ? key : `${path}.${key}`}: unknown key`);
	}
}

function readPrompt(value: unknown, errors: Errors): { guidelines: string[] } {
	const raw = asObject(value, "prompt", errors);
	checkUnknownKeys(raw, ["guidelines"], "prompt", errors);
	const guidelines =
		raw.guidelines === undefined
			? [...DEFAULTS.prompt.guidelines]
			: readStringArray(raw.guidelines, "prompt.guidelines", errors);
	return { guidelines };
}

function readGuidance(
	value: unknown,
	errors: Errors,
): Partial<Record<ToolId, GuidanceFields>> {
	const raw = asObject(value, "guidance", errors);
	checkUnknownKeys(raw, TOOL_IDS, "guidance", errors);
	const guidance: Partial<Record<ToolId, GuidanceFields>> = {};
	for (const id of TOOL_IDS) {
		if (raw[id] !== undefined)
			guidance[id] = readGuidanceFields(raw[id], `guidance.${id}`, errors);
	}
	return guidance;
}

function readGuidanceFields(
	value: unknown,
	path: string,
	errors: Errors,
): GuidanceFields {
	const raw = asObject(value, path, errors);
	checkUnknownKeys(raw, GUIDANCE_KEYS, path, errors);
	const fields: GuidanceFields = {};
	const description = optionalClearableString(
		raw.description,
		`${path}.description`,
		errors,
	);
	const snippet = optionalClearableString(
		raw.promptSnippet,
		`${path}.promptSnippet`,
		errors,
	);
	if (description !== undefined) fields.description = description;
	if (snippet !== undefined) fields.promptSnippet = snippet;
	if (raw.promptGuidelines !== undefined) {
		fields.promptGuidelines = readStringArray(
			raw.promptGuidelines,
			`${path}.promptGuidelines`,
			errors,
		);
	}
	return fields;
}

/** 允许空串的字符串：`""` 原样返回，让调用方区分「未配置」与「显式清空」。 */
function optionalClearableString(
	value: unknown,
	path: string,
	errors: Errors,
): string | undefined {
	if (value === undefined) return undefined;
	if (typeof value !== "string" || (value !== "" && value.trim() === "")) {
		errors.push(
			`${path}: expected a string ("" clears it), got ${JSON.stringify(value)}`,
		);
		return undefined;
	}
	return value;
}

function readStringArray(
	value: unknown,
	path: string,
	errors: Errors,
): string[] {
	if (!Array.isArray(value)) {
		errors.push(`${path}: expected an array of strings`);
		return [];
	}
	const items: string[] = [];
	for (const item of value) {
		if (typeof item !== "string" || item.trim() === "") {
			errors.push(
				`${path}: expected non-empty strings, got ${JSON.stringify(item)}`,
			);
			continue;
		}
		items.push(item);
	}
	return items;
}

function asObject(value: unknown, path: string, errors: Errors): Raw {
	if (value === undefined) return {};
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		errors.push(`${path}: expected an object`);
		return {};
	}
	return value as Raw;
}

/**
 * 枚举越界取默认值，不报错（SPEC-0001「枚举越界取默认值」）。
 * 非字符串是类型错误，按 SPEC「字段非法抛 Error」报错。
 */
function readEnum<T extends string>(
	value: unknown,
	allowed: readonly T[],
	fallback: T,
	path: string,
	errors: Errors,
): T {
	if (value === undefined) return fallback;
	if (typeof value === "string") {
		return (allowed as readonly string[]).includes(value)
			? (value as T)
			: fallback;
	}
	errors.push(
		`${path}: expected one of ${allowed.join(" / ")}, got ${JSON.stringify(value)}`,
	);
	return fallback;
}

function readBoolean(
	value: unknown,
	fallback: boolean,
	path: string,
	errors: Errors,
): boolean {
	if (value === undefined) return fallback;
	if (typeof value !== "boolean") {
		errors.push(`${path}: expected a boolean, got ${JSON.stringify(value)}`);
		return fallback;
	}
	return value;
}

function readString(
	value: unknown,
	fallback: string,
	path: string,
	errors: Errors,
): string {
	if (value === undefined) return fallback;
	if (typeof value !== "string" || value.trim() === "") {
		errors.push(
			`${path}: expected a non-empty string, got ${JSON.stringify(value)}`,
		);
		return fallback;
	}
	return value;
}

function readNumber(
	value: unknown,
	fallback: number,
	path: string,
	errors: Errors,
	range: readonly [number, number],
): number {
	if (value === undefined) return clamp(fallback, range);
	if (typeof value !== "number" || !Number.isFinite(value)) {
		errors.push(`${path}: expected a number, got ${JSON.stringify(value)}`);
		return clamp(fallback, range);
	}
	return clamp(value, range);
}

function clamp(value: number, range: readonly [number, number]): number {
	return Math.min(range[1], Math.max(range[0], value));
}
