/**
 * `chrome_tab`：列标签、开新标签、切、关、并组。
 * `tab` 参数在这里解析成标签 id，命中 0 个或多个都在这里报错。
 */

import { type TabInfo, tabsText } from "../../format/index.ts";
import { errorInfo } from "../errors.ts";
import { okResult, type ToolResult } from "../result.ts";
import {
	call,
	ExecError,
	listTabs,
	type RunContext,
	resolveTabId,
	targetIdOf,
} from "./common.ts";

/** `chrome_tab` 的参数。 */
export interface TabParams {
	action: "list" | "new" | "switch" | "close" | "group";
	tab?: string;
	url?: string;
}

export async function runTab(
	ctx: RunContext,
	params: TabParams,
): Promise<ToolResult> {
	const { config } = ctx.deps;
	const group = {
		groupName: config.chrome.groupName,
		groupColor: config.chrome.groupColor,
	};
	switch (params.action) {
		case "list": {
			const tabs = await listTabs(ctx);
			return okResult(tabsText(tabs), { tabs });
		}
		case "new": {
			const result = (await call(ctx, "tab.new", {
				url: params.url,
				...group,
				background: true,
			})) as TabInfo;
			const id = targetIdOf(result);
			if (id !== undefined) ctx.deps.target.set(id);
			return okResult(
				`ok: new ${[id, result?.url].filter(Boolean).join(" ")}`.trim(),
				{ result },
			);
		}
		case "switch": {
			const tabId = await requireTab(ctx, "switch", params.tab);
			const result = await call(ctx, "tab.activate", {
				tabId,
				background: false,
			});
			return okResult(`ok: switch ${tabId}`, { result });
		}
		case "close": {
			const tabId = await requireTab(ctx, "close", params.tab);
			const result = await call(ctx, "tab.close", { tabId });
			return okResult(`ok: close ${tabId}`, { result });
		}
		case "group": {
			const tabId = await requireTab(ctx, "group", params.tab);
			const result = await call(ctx, "tab.group", { tabId, ...group });
			return okResult(`ok: group ${tabId}`, { result });
		}
		default:
			throw new ExecError(
				errorInfo("bad_args", `unknown tab action: ${params.action}`),
			);
	}
}

/** `switch`、`close`、`group` 必须有 `tab`。 */
async function requireTab(
	ctx: RunContext,
	action: string,
	tab: string | undefined,
): Promise<number> {
	if (tab === undefined || tab.trim() === "")
		throw new ExecError(errorInfo("bad_args", `${action} needs tab`));
	return await resolveTabId(ctx, tab);
}
