/**
 * 执行器的公共部分：发命令（含超时与扩展检查）、标签解析、target 记录。
 * 五个执行器共用，不出这个目录。
 */

import type { ResolvedConfig } from "../../config/index.ts";
import type { TabInfo } from "../../format/index.ts";
import { candidatesText } from "../../format/index.ts";
import {
	type ActionName,
	type BridgeStatus,
	DEFAULT_COMMAND_TIMEOUT_MS,
} from "../../protocol/index.ts";
import { errorInfo } from "../errors.ts";

/** 执行器用到的桥。桩只要这三个方法。 */
export interface ExecBridge {
	start(): Promise<void>;
	/** 等扩展第一次轮询，最多 2 秒；只对从未见过的扩展等待。 */
	waitForFirstPoll(timeoutMs?: number): Promise<BridgeStatus>;
	send(
		action: ActionName,
		params?: Record<string, unknown>,
		options?: { timeoutMs?: number; signal?: AbortSignal },
	): Promise<unknown>;
}

/** 本会话的自动化 target 标签 id。`/chrome status` 读它，navigate 与 tab.new 写它。 */
export interface SessionTarget {
	get(): number | undefined;
	set(id: number): void;
}

/** 落盘的截图，由 `src/fs/` 实现。 */
export type SaveScreenshots = (options: {
	dir: string;
	format: "png" | "jpeg";
	images: { data: string }[];
	keepNewest: number;
}) => Promise<string[]>;

export interface ExecDeps {
	bridge: ExecBridge;
	config: ResolvedConfig;
	target: SessionTarget;
	/** 截图落盘。默认 `src/fs/` 的实现，测试给假的。 */
	saveScreenshots?: SaveScreenshots;
}

/**
 * 一次执行的上下文。`sessionKey` 取自 `ctx.sessionManager.getSessionId()`：
 * 扩展按它分 target 台账，所以一个 Pi 会话一份，换会话就换 key。
 */
export interface RunContext {
	deps: ExecDeps;
	sessionKey: string;
	/** 调用方取消。桥把它变成 `aborted`。 */
	signal?: AbortSignal;
}

/** 一次工具调用的默认上限。SPEC-0001 非功能：30 秒。 */
export const DEFAULT_TIMEOUT_MS = DEFAULT_COMMAND_TIMEOUT_MS;

/** 整页截图的上限。SPEC-0001 非功能：120 秒。 */
export const FULL_PAGE_TIMEOUT_MS = 120_000;

/** 带类别与附加说明的失败。顶层把它翻成结果信封。 */
export class ExecError extends Error {
	readonly info: ReturnType<typeof errorInfo>;
	readonly extra: string | undefined;

	constructor(info: ReturnType<typeof errorInfo>, extra?: string) {
		super(`${info.class}: ${info.message}`);
		this.name = "ExecError";
		this.info = info;
		this.extra = extra;
	}
}

/** `navigate` 等加载的上限：配置的导航超时加 2 秒。 */
export function navigateTimeoutMs(config: ResolvedConfig): number {
	return config.timing.navigateTimeoutMs + 2_000;
}

/**
 * 发一条命令。先等扩展第一次轮询（最多 2 秒），再确认它连着，然后带上 sessionKey 与超时。
 * 桥没起时 `start()` 顺手起；从未见过的扩展给 2 秒宽限，见过但过期的立即报
 * `extension_missing`，不白等到超时。
 */
export async function call(
	ctx: RunContext,
	action: ActionName,
	params: Record<string, unknown>,
	timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<unknown> {
	const { bridge } = ctx.deps;
	await bridge.start();
	const status = await bridge.waitForFirstPoll();
	if (!status.connected)
		throw new ExecError(
			errorInfo(
				"extension_missing",
				`the browser extension is not connected on ${new URL(status.url).host}`,
			),
		);
	return await bridge.send(
		action,
		{ sessionKey: ctx.sessionKey, ...params },
		{ timeoutMs, signal: ctx.signal },
	);
}

/** 列出本会话窗口里的标签页。 */
export async function listTabs(
	ctx: RunContext,
	timeoutMs?: number,
): Promise<TabInfo[]> {
	const result = (await call(ctx, "tab.list", {}, timeoutMs)) as {
		tabs?: TabInfo[];
	};
	return result.tabs ?? [];
}

/**
 * 把 `tab` 参数（id、URL 子串、标题子串）解析成标签 id。
 * 命中 0 个报 `tab_not_found`、多个报 `tab_ambiguous`，两者都带最多 5 个候选。
 */
export async function resolveTabId(
	ctx: RunContext,
	tab: string,
	timeoutMs?: number,
): Promise<number> {
	const tabs = await listTabs(ctx, timeoutMs);
	const needle = tab.trim().toLowerCase();
	const hits = tabs.filter(
		(item) =>
			String(item.id) === needle ||
			(item.url ?? "").toLowerCase().includes(needle) ||
			(item.title ?? "").toLowerCase().includes(needle),
	);
	if (hits.length === 1) return hits[0].id;
	if (hits.length === 0)
		throw new ExecError(
			errorInfo("tab_not_found", `no tab matches "${tab}"`),
			candidatesText(tabs),
		);
	throw new ExecError(
		errorInfo("tab_ambiguous", `tab "${tab}" matches ${hits.length} tabs`),
		candidatesText(hits),
	);
}

/** `tab` 参数在时解析成 `{ tabId }`，不在时返回空对象，让扩展用本会话的 target。 */
export async function tabParams(
	ctx: RunContext,
	tab: string | undefined,
	timeoutMs?: number,
): Promise<Record<string, unknown>> {
	if (tab === undefined) return {};
	return { tabId: await resolveTabId(ctx, tab, timeoutMs) };
}

/** 从命令应答里取 target 标签 id：`{ id }` 或 `{ tabId }`。 */
export function targetIdOf(result: unknown): number | undefined {
	if (typeof result !== "object" || result === null) return undefined;
	const record = result as { id?: unknown; tabId?: unknown };
	if (typeof record.id === "number") return record.id;
	if (typeof record.tabId === "number") return record.tabId;
	return undefined;
}

/** 从命令应答里取动作顺带开的新标签。扩展没给就当没开。 */
export function openedOf(result: unknown): TabInfo[] {
	if (typeof result !== "object" || result === null) return [];
	const opened = (result as { opened?: unknown }).opened;
	if (!Array.isArray(opened)) return [];
	return opened.filter(
		(item): item is TabInfo =>
			typeof item === "object" &&
			item !== null &&
			typeof (item as { id?: unknown }).id === "number",
	);
}

/** 从命令应答里取变更量。扩展没给就不打变更行。 */
export function changedOf(
	result: unknown,
): { added: number; removed: number; updated: number } | undefined {
	if (typeof result !== "object" || result === null) return undefined;
	const changed = (result as { changed?: unknown }).changed;
	if (typeof changed !== "object" || changed === null) return undefined;
	const { added, removed, updated } = changed as Record<string, unknown>;
	if (
		typeof added !== "number" ||
		typeof removed !== "number" ||
		typeof updated !== "number"
	)
		return undefined;
	return { added, removed, updated };
}
