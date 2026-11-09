/**
 * `chrome_see`：读页面。快照四个模式、深查、日志三条路。
 * 快照的裁剪在扩展侧做，这里只把结构化结果翻成正文与 details。
 */

import { type Snapshot, snapshotText, valueText } from "../../format/index.ts";
import { okResult, type ToolResult } from "../result.ts";
import { call, type RunContext, tabParams } from "./common.ts";

/** `chrome_see` 的参数。日志与快照共用。 */
export interface SeeParams {
	mode?: "refs" | "text" | "changes" | "full";
	query?: string;
	ref?: string;
	selector?: string;
	logs?: "console" | "network";
	request_id?: string;
	clear?: boolean;
	tab?: string;
}

/** 日志条数不进 details：正文里已经数过。 */
export async function runSee(
	ctx: RunContext,
	params: SeeParams,
	timeoutMs?: number,
): Promise<ToolResult> {
	if (params.logs !== undefined || params.request_id !== undefined)
		return runLogs(ctx, params, timeoutMs);

	const snapshot = await snapshotOf(ctx, params, timeoutMs);
	return okResult(snapshotText(snapshot), detailsOf(snapshot));
}

/**
 * 取一次快照。`chrome_act` 的 `see` 也走这条，附在动作之后。
 * 元素与正文的上限取配置，不由单次调用覆盖。
 */
export async function snapshotOf(
	ctx: RunContext,
	params: SeeParams,
	timeoutMs?: number,
): Promise<Snapshot> {
	const snapshot = (await call(
		ctx,
		"page.snapshot",
		{
			...(await tabParams(ctx, params.tab, timeoutMs)),
			mode: params.mode ?? "refs",
			query: params.query,
			ref: params.ref,
			selector: params.selector,
			maxElements: ctx.deps.config.output.maxElements,
			textChars: ctx.deps.config.output.textChars,
		},
		timeoutMs,
	)) as Snapshot;
	return snapshot;
}

/** 日志：console、network 列表、单条请求详情。`clear` 读完就清。 */
async function runLogs(
	ctx: RunContext,
	params: SeeParams,
	timeoutMs?: number,
): Promise<ToolResult> {
	const tab = await tabParams(ctx, params.tab, timeoutMs);
	if (params.request_id !== undefined) {
		const record = await call(
			ctx,
			"page.network.get",
			{ ...tab, requestId: params.request_id },
			timeoutMs,
		);
		return okResult(valueText(record), { logs: "network" });
	}
	const logs = params.logs ?? "console";
	const result = (await call(
		ctx,
		logs === "console" ? "page.console.list" : "page.network.list",
		{ ...tab, clear: params.clear === true },
		timeoutMs,
	)) as { records?: unknown[]; note?: string };
	const records = result.records ?? [];
	const lines = records.map((record) => valueText(record));
	if (result.note !== undefined) lines.unshift(result.note);
	return okResult(
		lines.length === 0
			? `no ${logs} records captured for this tab`
			: lines.join("\n"),
		{ logs, count: records.length },
	);
}

/** details 只带该模式有意义的字段，形状按 SPEC-0001 的结果信封表。 */
function detailsOf(snapshot: Snapshot): Record<string, unknown> {
	const details: Record<string, unknown> = {
		mode: snapshot.mode,
		url: snapshot.url,
		title: snapshot.title,
	};
	if (snapshot.mode === "refs" || snapshot.mode === "full")
		details.elements = snapshot.elements;
	if (snapshot.mode === "text" || snapshot.mode === "full")
		details.text = snapshot.text;
	if (snapshot.mode === "changes") details.changes = snapshot.changes;
	if (snapshot.truncated === true) details.truncated = true;
	return details;
}
