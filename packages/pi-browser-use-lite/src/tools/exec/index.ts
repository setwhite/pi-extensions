/**
 * 执行器入口：按工具 id 分派，把异常统一折成结果信封。
 * 只有这里认识工具 id 与异常；五个执行器各管自己的动作。
 */

import { classify, errorInfo } from "../errors.ts";
import { errorResult, type ToolResult } from "../result.ts";
import type { ActParams } from "./act.ts";
import { runAct } from "./act.ts";
import type { CdpParams } from "./cdp.ts";
import { runCdp } from "./cdp.ts";
import { type ExecDeps, ExecError } from "./common.ts";
import type { SeeParams } from "./see.ts";
import { runSee } from "./see.ts";
import type { TabParams } from "./tab.ts";
import { runTab } from "./tab.ts";
import { runVision, type VisionParams } from "./vision.ts";

export type * from "./common.ts";

/** 五个工具的执行入口。`sessionKey` 由调用方从工具上下文的会话 id 取。 */
export interface Executors {
	execute(
		toolId: string,
		params: unknown,
		sessionKey: string,
		signal?: AbortSignal,
	): Promise<ToolResult>;
}

export function createExecutors(deps: ExecDeps): Executors {
	return {
		execute: async (toolId, params, sessionKey, signal) => {
			const ctx = { deps, sessionKey, signal };
			try {
				return await dispatch(toolId, ctx, params);
			} catch (cause) {
				if (cause instanceof ExecError)
					return errorResult(cause.info, cause.extra);
				return errorResult(classify(cause));
			}
		},
	};
}

async function dispatch(
	toolId: string,
	ctx: { deps: ExecDeps; sessionKey: string; signal?: AbortSignal },
	params: unknown,
): Promise<ToolResult> {
	switch (toolId) {
		case "chrome_act":
			return await runAct(ctx, params as ActParams);
		case "chrome_see":
			return await runSee(ctx, params as SeeParams);
		case "chrome_tab":
			return await runTab(ctx, params as TabParams);
		case "chrome_vision":
			return await runVision(ctx, params as VisionParams);
		case "chrome_cdp":
			return await runCdp(ctx, params as CdpParams);
		default:
			throw new ExecError(errorInfo("bad_args", `unknown tool: ${toolId}`));
	}
}
