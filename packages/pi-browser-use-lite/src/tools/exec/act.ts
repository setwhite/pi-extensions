/**
 * `chrome_act`：把 action 翻成动作与 params，调桥，把结果翻成判定行、变更行与可选快照。
 * `batch` 在这里递归执行，用的是同一份翻法。
 */

import { changedLine, snapshotText, valueText } from "../../format/index.ts";
import type { ActionName } from "../../protocol/index.ts";
import { classify, errorInfo } from "../errors.ts";
import { okResult, type ToolResult } from "../result.ts";
import {
	call,
	changedOf,
	DEFAULT_TIMEOUT_MS,
	ExecError,
	navigateTimeoutMs,
	type RunContext,
	tabParams,
	targetIdOf,
} from "./common.ts";
import { snapshotOf } from "./see.ts";

/** `batch` 的步数上限。SPEC-0001 非功能：50 步。 */
export const MAX_BATCH_STEPS = 50;

/** `wait` 的默认上限。SPEC-0001 非功能：15 秒。 */
export const DEFAULT_WAIT_MS = 15_000;

/** `chrome_act` 的参数。字段名按 SPEC-0001 的动作表。 */
export interface ActParams {
	action: string;
	tab?: string;
	see?: "refs" | "text" | "changes" | "full";
	[key: string]: unknown;
}

/** 一步的动作计划：发哪条命令、带什么参数、判定行怎么写、超时多少。 */
interface ActPlan {
	command: ActionName;
	params: Record<string, unknown>;
	line: string;
	timeoutMs: number;
	ref?: string;
	/** 成功后把应答里的 `id` 记成本会话的 target。 */
	recordsTarget?: boolean;
}

export async function runAct(
	ctx: RunContext,
	params: ActParams,
	timeoutMs?: number,
): Promise<ToolResult> {
	if (params.action === "batch") return runBatch(ctx, params, timeoutMs);
	const plan = await planOf(ctx, params, timeoutMs);
	const result = await call(ctx, plan.command, plan.params, plan.timeoutMs);
	if (plan.recordsTarget) {
		const id = targetIdOf(result);
		if (id !== undefined) ctx.deps.target.set(id);
	}
	const lines = [plan.line];
	const changed = changedOf(result);
	if (changed !== undefined) lines.push(changedLine(changed));
	const value = resultValue(result);
	if (value !== undefined) lines.push(valueText(value));
	const details: Record<string, unknown> = {
		ok: true,
		action: params.action,
	};
	if (changed !== undefined) details.changed = changed;
	if (value !== undefined) details.value = value;
	if (plan.ref !== undefined) details.ref = plan.ref;
	if (params.see !== undefined) {
		const snapshot = await snapshotOf(ctx, {
			mode: params.see,
			tab: params.tab,
		});
		lines.push("", snapshotText(snapshot));
		details.snapshot = { mode: params.see };
	}
	return okResult(lines.join("\n"), details);
}

/** 逐个跑 `steps`。超 50 步在发任何命令之前就报错。某步失败且没 `optional` 时停下。 */
async function runBatch(
	ctx: RunContext,
	params: ActParams,
	timeoutMs?: number,
): Promise<ToolResult> {
	const steps = (params.steps ?? []) as {
		action: string;
		optional?: boolean;
		args?: Record<string, unknown>;
	}[];
	if (steps.length > MAX_BATCH_STEPS)
		throw new ExecError(
			errorInfo(
				"bad_args",
				`batch takes at most ${MAX_BATCH_STEPS} steps, got ${steps.length}`,
			),
		);

	const deadline = Date.now() + (timeoutMs ?? DEFAULT_TIMEOUT_MS);
	const done: string[] = [];
	let failed = 0;
	for (const [index, step] of steps.entries()) {
		const remaining = deadline - Date.now();
		const where = `step ${index + 1} of ${steps.length}`;
		if (remaining <= 0)
			throw new ExecError(
				errorInfo("timeout", `batch ran out of its budget at ${where}`),
				done.join("\n"),
			);
		try {
			const result = await runAct(
				ctx,
				{ ...step.args, action: step.action },
				remaining,
			);
			done.push(textOf(result));
		} catch (cause) {
			const info = cause instanceof ExecError ? cause.info : classify(cause);
			if (step.optional === true) {
				failed += 1;
				done.push(`${where} skipped: ${info.class}: ${info.message}`);
				continue;
			}
			throw new ExecError(
				{ ...info, message: `${where} failed: ${info.message}` },
				done.join("\n"),
			);
		}
	}
	return okResult([`ok: batch ${steps.length} steps`, ...done].join("\n"), {
		ok: true,
		action: "batch",
		steps: steps.length,
		failed,
	});
}

/** 一个动作的翻法。定位方式、超时与 target 记录都在这里定。 */
async function planOf(
	ctx: RunContext,
	params: ActParams,
	timeoutMs?: number,
): Promise<ActPlan> {
	const limit = timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const tab = await tabParams(ctx, params.tab, limit);
	const config = ctx.deps.config;
	switch (params.action) {
		case "navigate":
			return {
				command: "page.navigate",
				params: {
					...tab,
					url: params.url,
					initScript: params.init_script,
					// 扩展等加载用配置的导航超时；宿主的 send 超时比它多 2 秒当保险。
					timeoutMs: config.timing.navigateTimeoutMs,
					// 建 target 要用的组配置：navigate 是唯一会顺手建 target 的动作。
					groupName: config.chrome.groupName,
					groupColor: config.chrome.groupColor,
				},
				line: `ok: navigate ${String(params.url)}`,
				timeoutMs: navigateTimeoutMs(config),
				recordsTarget: true,
			};
		case "click":
		case "hover": {
			const locator = locatorOf(params);
			return {
				command: params.action === "click" ? "page.click" : "page.hover",
				params: { ...tab, ...locator.params },
				line: `ok: ${params.action} ${locator.label}`,
				timeoutMs: limit,
				ref: locator.ref,
			};
		}
		case "type":
			return {
				command: "page.type",
				params: {
					...tab,
					text: params.text ?? "",
					replace: params.replace === true,
					press: params.press,
				},
				line: `ok: type ${JSON.stringify(params.text ?? "")}`,
				timeoutMs: limit,
			};
		case "fill":
			return {
				command: "page.fill",
				params: { ...tab, fields: params.fields },
				line: `ok: fill ${(params.fields as unknown[] | undefined)?.length ?? 0} fields`,
				timeoutMs: limit,
			};
		case "press":
			return {
				command: "page.key",
				params: { ...tab, key: params.key },
				line: `ok: press ${String(params.key)}`,
				timeoutMs: limit,
			};
		case "drag":
			return {
				command: "page.drag",
				params: {
					...tab,
					from: pointOf(params, "from_"),
					to: pointOf(params, "to_"),
					steps: config.input.dragSteps,
				},
				line: `ok: drag ${pointText(params, "from_")} -> ${pointText(params, "to_")}`,
				timeoutMs: limit,
			};
		case "scroll":
			return {
				command: "page.scroll",
				params: {
					...tab,
					dx: params.dx ?? 0,
					dy: params.dy ?? 0,
					steps: config.input.scrollSteps,
				},
				line: `ok: scroll ${formatDelta(params)}`,
				timeoutMs: limit,
			};
		case "upload":
			return {
				command: "page.upload",
				params: { ...tab, paths: params.paths, timeoutMs: limit },
				line: `ok: upload ${(params.paths as unknown[] | undefined)?.length ?? 0} files`,
				timeoutMs: limit,
			};
		case "eval":
			return {
				command: "page.evaluate",
				params: { ...tab, js: params.js },
				line: "ok: eval",
				timeoutMs: limit,
			};
		case "wait": {
			const waitMs =
				typeof params.timeout_ms === "number"
					? params.timeout_ms
					: DEFAULT_WAIT_MS;
			return {
				command: "page.waitFor",
				params: {
					...tab,
					kind: params.kind,
					value: params.value,
					timeoutMs: waitMs,
				},
				line: `ok: wait ${String(params.kind)}=${String(params.value)}`,
				timeoutMs: Math.max(limit, waitMs + 2_000),
			};
		}
		default:
			throw new ExecError(
				errorInfo("bad_args", `unknown action: ${params.action}`),
			);
	}
}

/** 一次调用的定位方式：`ref`、`selector` 或 `x`+`y`。缺了就报 `bad_args`。 */
function locatorOf(params: ActParams): {
	params: Record<string, unknown>;
	label: string;
	ref?: string;
} {
	if (typeof params.ref === "string" && params.ref !== "")
		return {
			params: { ref: params.ref },
			label: `ref=${params.ref}`,
			ref: params.ref,
		};
	if (typeof params.selector === "string" && params.selector !== "")
		return {
			params: { selector: params.selector },
			label: `selector=${params.selector}`,
		};
	if (typeof params.x === "number" && typeof params.y === "number")
		return {
			params: { x: params.x, y: params.y },
			label: `x=${params.x} y=${params.y}`,
		};
	throw new ExecError(
		errorInfo("bad_args", `${params.action} needs ref, selector or x with y`),
	);
}

/** `from_*` 与 `to_*` 两组参数各成一个点。缺定位就报 `bad_args`。 */
function pointOf(
	params: ActParams,
	prefix: "from_" | "to_",
): Record<string, unknown> {
	if (typeof params[`${prefix}ref`] === "string")
		return { ref: params[`${prefix}ref`] };
	if (typeof params[`${prefix}selector`] === "string")
		return { selector: params[`${prefix}selector`] };
	if (
		typeof params[`${prefix}x`] === "number" &&
		typeof params[`${prefix}y`] === "number"
	)
		return { x: params[`${prefix}x`], y: params[`${prefix}y`] };
	throw new ExecError(
		errorInfo(
			"bad_args",
			`drag needs ${prefix}ref, ${prefix}selector or ${prefix}x with ${prefix}y`,
		),
	);
}

function pointText(params: ActParams, prefix: "from_" | "to_"): string {
	if (typeof params[`${prefix}ref`] === "string")
		return `ref=${params[`${prefix}ref`]}`;
	if (typeof params[`${prefix}selector`] === "string")
		return `selector=${params[`${prefix}selector`]}`;
	return `x=${params[`${prefix}x`]} y=${params[`${prefix}y`]}`;
}

function formatDelta(params: ActParams): string {
	const parts: string[] = [];
	if (typeof params.dy === "number" && params.dy !== 0)
		parts.push(`dy=${params.dy}`);
	if (typeof params.dx === "number" && params.dx !== 0)
		parts.push(`dx=${params.dx}`);
	return parts.length === 0 ? "dx=0 dy=0" : parts.join(" ");
}

/** 应答里的返回值：`{ value }` 或 `{ waitedMs }`。 */
function resultValue(result: unknown): unknown {
	if (typeof result !== "object" || result === null) return undefined;
	const record = result as { value?: unknown; waitedMs?: unknown };
	if (record.value !== undefined) return record.value;
	if (typeof record.waitedMs === "number") return `waited ${record.waitedMs}ms`;
	return undefined;
}

/** 结果里的正文，用于 `batch` 汇总。 */
function textOf(result: ToolResult): string {
	const block = result.content[0];
	return block !== undefined && "text" in block ? block.text : "";
}
