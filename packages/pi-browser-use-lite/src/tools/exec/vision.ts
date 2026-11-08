/**
 * `chrome_vision`：截屏落盘，content 只给路径。
 * 图片数据不进结果信封，模型要看图时自己读路径。
 */

import { savedText } from "../../format/index.ts";
import { saveScreenshots } from "../../fs/index.ts";
import { errorInfo } from "../errors.ts";
import { okResult, type ToolResult } from "../result.ts";
import {
	call,
	ExecError,
	FULL_PAGE_TIMEOUT_MS,
	type RunContext,
	tabParams,
} from "./common.ts";

/** `chrome_vision` 的参数。 */
export interface VisionParams {
	full_page?: boolean;
	tab?: string;
}

export async function runVision(
	ctx: RunContext,
	params: VisionParams,
): Promise<ToolResult> {
	const { config } = ctx.deps;
	const fullPage = params.full_page === true;
	const timeoutMs = fullPage ? FULL_PAGE_TIMEOUT_MS : undefined;
	const result = (await call(
		ctx,
		"page.screenshot",
		{
			...(await tabParams(ctx, params.tab, timeoutMs)),
			format: config.screenshot.format,
			fullPage,
		},
		timeoutMs,
	)) as { format?: "png" | "jpeg"; images?: { data: string }[] };
	const images = result.images ?? [];
	if (images.length === 0)
		throw new ExecError(
			errorInfo("page_error", "the extension returned no image data"),
		);
	const save = ctx.deps.saveScreenshots ?? saveScreenshots;
	const paths = await save({
		dir: config.screenshot.dir,
		format: result.format ?? config.screenshot.format,
		images: [...images],
		keepNewest: config.screenshot.keepNewest,
	});
	const details: Record<string, unknown> = { path: paths[0] };
	if (paths.length > 1) details.tiles = paths.length;
	return okResult(savedText(paths), details);
}
