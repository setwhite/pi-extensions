/**
 * `chrome_cdp`：原始 CDP 逃生口。方法名与参数原样转给扩展，结果按 JSON 回。
 */

import { valueText } from "../../format/index.ts";
import { okResult, type ToolResult } from "../result.ts";
import { call, type RunContext, tabParams } from "./common.ts";

/** `chrome_cdp` 的参数。 */
export interface CdpParams {
	method: string;
	params?: unknown;
	tab?: string;
}

export async function runCdp(
	ctx: RunContext,
	params: CdpParams,
): Promise<ToolResult> {
	const result = (await call(ctx, "cdp.call", {
		...(await tabParams(ctx, params.tab)),
		method: params.method,
		params: params.params,
	})) as { result?: unknown };
	const value = result?.result ?? null;
	return okResult(valueText(value), { result: value });
}
