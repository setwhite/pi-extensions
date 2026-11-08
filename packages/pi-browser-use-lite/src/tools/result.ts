/**
 * 工具结果信封：content 只放面向模型的文本，细节放 details。
 * 超过截断线的文本在这里切，五个工具共用同一份规则。
 */

import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import { errorText } from "../format/index.ts";
import type { ErrorInfo } from "./errors.ts";

/** content 的截断线。SPEC-0001 非功能：32,000 字符，比 `full` 的 30,000 留 2,000 余量。 */
export const CONTENT_LIMIT = 32_000;

export type ToolResult = AgentToolResult<Record<string, unknown>>;

/** 成功结果。文本超限时截断，并在 details 里标 `truncated`。 */
export function okResult(
	text: string,
	details: Record<string, unknown>,
): ToolResult {
	const clipped = clip(text);
	return {
		content: [{ type: "text", text: clipped.text }],
		details: clipped.dropped > 0 ? { ...details, truncated: true } : details,
	};
}

/** 失败结果。第一行是类别与原因，第二行是 hint，`extra` 接在 hint 之后（如候选列表）。 */
export function errorResult(error: ErrorInfo, extra?: string): ToolResult {
	const text =
		extra === undefined ? errorText(error) : `${errorText(error)}\n${extra}`;
	return {
		content: [{ type: "text", text: clip(text).text }],
		details: { error },
		isError: true,
	};
}

/** 按截断线切文本。说明占的字符也算在截断线内，丢掉的数量与实际切掉的一致。 */
function clip(text: string): { text: string; dropped: number } {
	if (text.length <= CONTENT_LIMIT) return { text, dropped: 0 };
	let kept = CONTENT_LIMIT;
	let dropped = text.length - kept;
	// 说明里的数字位数会改变说明本身的长度，迭代到不再变为止。
	for (;;) {
		const next = CONTENT_LIMIT - noteOf(dropped).length;
		const nextDropped = text.length - next;
		if (next === kept) break;
		kept = next;
		dropped = nextDropped;
	}
	return { text: text.slice(0, kept) + noteOf(dropped), dropped };
}

function noteOf(dropped: number): string {
	return `\n[truncated: ${dropped} characters dropped]`;
}
