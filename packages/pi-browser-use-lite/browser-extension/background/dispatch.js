/**
 * 动作路由表：动作名 → 处理函数。键与 src/protocol 的 `ACTION_NAMES` 一致。
 *
 * 用 Map 而不是对象：动作名来自命令，对象查表会命中原型链上的名字（`toString` 等）。
 * target 解析在 dispatch 里统一做一步，不散进每个处理函数。
 */

import {
	listConsole,
	listNetwork,
	networkRequest,
	startCapture,
} from "./capture.js";
import { sendCommand } from "./input/debugger.js";
import { fill, press, type as typeText } from "./input/keyboard.js";
import { click, drag, hover, scroll } from "./input/pointer.js";
import { upload } from "./input/upload.js";
import { evaluatePage } from "./page/evaluate.js";
import { screenshotPage } from "./page/screenshot.js";
import {
	changesSince,
	elementAt,
	markBaseline,
	snapshotPage,
} from "./page/snapshot.js";
import { waitFor } from "./page/waitFor.js";
import { activateTab, closeTab, listTabs, navigateTab } from "./tabs.js";
import { cleanupAutomation, createTarget, targetFor } from "./target.js";

/** 需要一个标签 id 的动作。其余动作自己从 params 取会话信息。 */
const TAB_ACTIONS = new Set([
	"page.navigate",
	"page.snapshot",
	"page.inspect",
	"page.evaluate",
	"page.click",
	"page.hover",
	"page.drag",
	"page.upload",
	"page.type",
	"page.fill",
	"page.key",
	"page.scroll",
	"page.screenshot",
	"page.waitFor",
	"page.console.list",
	"page.network.list",
	"page.network.get",
	"cdp.call",
]);

/** 可能顺带开新标签的动作：点链接、回车提交都可能走 `target=_blank`，这时目标标签的 URL 不变。 */
const OPENING_ACTIONS = new Set([
	"page.click",
	"page.type",
	"page.fill",
	"page.key",
]);

/**
 * 结果要带变更量的动作。悬停不在里面：鼠标经过不改 DOM，拍两次快照只会白花时间。
 * navigate 也不在：跨文档的基线与新页面不可比，导航后要变更量就传 see。
 */
const CHANGED_ACTIONS = new Set([
	"page.click",
	"page.type",
	"page.fill",
	"page.key",
	"page.drag",
	"page.upload",
	"page.scroll",
]);

export const routes = new Map([
	[
		"tab.version",
		() => ({ extensionVersion: chrome.runtime.getManifest().version }),
	],
	[
		"tab.list",
		async ({ sessionKey } = {}) => ({ tabs: await listTabs({ sessionKey }) }),
	],
	[
		"tab.new",
		async ({ sessionKey, url } = {}) => ({
			id: await createTarget({ sessionKey, url }),
		}),
	],
	["tab.activate", ({ tabId } = {}) => activateTab({ tabId })],
	["tab.close", ({ tabId } = {}) => closeTab({ tabId })],
	[
		"page.navigate",
		({ tabId, url, initScript, timeoutMs } = {}) =>
			navigateTab({ tabId, url, initScript, timeoutMs }),
	],
	[
		"page.snapshot",
		({ tabId, mode, query, ref, selector, maxElements, textChars } = {}) =>
			snapshotPage({
				tabId,
				mode,
				query,
				ref,
				selector,
				maxElements,
				textChars,
			}),
	],
	[
		"page.inspect",
		({ tabId, ref, selector } = {}) => elementAt(tabId, { ref, selector }),
	],
	["page.evaluate", ({ tabId, js } = {}) => evaluatePage({ tabId, js })],
	["page.click", async (params) => click(await atPoint(params))],
	["page.hover", async (params) => hover(await atPoint(params))],
	[
		"page.drag",
		async ({ tabId, from, to, steps } = {}) =>
			drag({
				tabId,
				from: await locator(tabId, from),
				to: await locator(tabId, to),
				steps,
			}),
	],
	[
		"page.upload",
		({ tabId, paths, timeoutMs } = {}) => upload({ tabId, paths, timeoutMs }),
	],
	[
		"page.type",
		async ({ tabId, text, replace, press: key } = {}) => {
			const typed = await typeText({ tabId, text, replace });
			if (key === undefined) return typed;
			await press({ tabId, key });
			return typed;
		},
	],
	[
		"page.fill",
		// ref 只有快照能解成坐标，而且要在每次点击前才解：解析会滚动页面，
		// 预先解完所有字段会让先解析的坐标失效。
		({ tabId, fields } = {}) =>
			fill({
				tabId,
				fields: Array.isArray(fields)
					? fields.map((field) =>
							typeof field?.ref === "string" && field.ref !== ""
								? { ...field, locate: () => locator(tabId, field) }
								: field,
						)
					: fields,
			}),
	],
	["page.key", ({ tabId, key } = {}) => press({ tabId, key })],
	[
		"page.scroll",
		({ tabId, dx, dy, steps } = {}) => scroll({ tabId, dx, dy, steps }),
	],
	[
		"page.screenshot",
		({ tabId, format, fullPage } = {}) =>
			screenshotPage({ tabId, format, fullPage }),
	],
	[
		"page.console.list",
		({ tabId, clear } = {}) => listConsole(tabId, { clear: clear === true }),
	],
	[
		"page.network.list",
		({ tabId, clear } = {}) => listNetwork(tabId, { clear: clear === true }),
	],
	[
		"page.network.get",
		({ tabId, requestId } = {}) => networkRequest(tabId, requestId),
	],
	[
		"page.waitFor",
		({ tabId, kind, value, timeoutMs } = {}) =>
			waitFor({ tabId, kind, value, timeoutMs }),
	],
	[
		"cdp.call",
		async ({ tabId, method, params } = {}) => ({
			result: await sendCommand(tabId, method, params),
		}),
	],
	[
		"automation.cleanup",
		({ sessionKey, closeOwnTabs } = {}) =>
			cleanupAutomation({ sessionKey, closeOwnTabs }),
	],
]);

/**
 * 路由一条命令。
 * 动作名不在表里抛 `Unknown action: …`。
 * 需要标签 id 的动作先取 target 并开日志抓取，改元素的动作前后各拍一次快照比出变更量。
 * @param {string} action 动作名
 * @param {Record<string, unknown>} [params] 动作参数
 * @returns {Promise<unknown>} 动作的结果
 */
export async function dispatch(action, params = {}) {
	if (!routes.has(action)) throw new Error(`Unknown action: ${action}`);
	const route = routes.get(action);
	if (!TAB_ACTIONS.has(action)) return await route(params);

	const tabId = await tabIdOf(action, params);
	await startCapture(tabId);
	const withTab = { ...params, tabId };
	if (!CHANGED_ACTIONS.has(action)) return await route(withTab);
	await markBaseline(tabId);
	const before = OPENING_ACTIONS.has(action)
		? await windowTabIds(tabId)
		: undefined;
	const result = await route(withTab);
	const changed = await changesSince(tabId);
	const opened = before === undefined ? [] : await openedSince(tabId, before);
	// 没开就不带这个字段：多一个恒为空的键，读结果的人要判断两次。
	if (opened.length === 0) return { ...result, changed };
	return { ...result, changed, opened };
}

/** 目标标签所在窗口里的标签 id。 */
async function windowTabIds(tabId) {
	const tabs = await windowTabs(tabId);
	return new Set(tabs.flatMap((tab) => (tab.id === undefined ? [] : [tab.id])));
}

/** 动作之后新出现的标签。目标标签自己不会变，宿主只能靠这份清单知道页面开了新页。 */
async function openedSince(tabId, before) {
	const tabs = await windowTabs(tabId);
	return tabs
		.filter((tab) => tab.id !== undefined && !before.has(tab.id))
		.map(({ id, active, title, url }) => ({ id, active, title, url }));
}

async function windowTabs(tabId) {
	const { windowId } = await chrome.tabs.get(tabId);
	return await chrome.tabs.query({ windowId });
}

/** 点名的标签 id 不合法就报错：退回会话 target 会作用到别的标签上。 */
function requireTabId(tabId) {
	if (!Number.isInteger(tabId))
		throw new Error(`bad_args: tabId must be an integer, got ${tabId}`);
	return tabId;
}

/**
 * 命令作用的标签：调用方点了标签就用它，否则用本会话的自动化 target。
 * @returns {Promise<number>} 标签 id
 */
async function tabIdOf(action, params) {
	if (params.tabId !== undefined) return requireTabId(params.tabId);
	return targetFor({ sessionKey: params.sessionKey, action });
}

/** 指针层的入参：ref 换成元素中心的视口坐标，其余原样。 */
async function atPoint({ tabId, ...target }) {
	return { tabId, ...(await locator(tabId, target)) };
}

/**
 * 指针层认 selector 或坐标，ref 由快照解析成坐标。
 * @returns {Promise<{ selector?: string, x?: number, y?: number }>} 定位
 */
async function locator(tabId, target = {}) {
	const { ref, selector, x, y } = target;
	if (typeof ref !== "string" || ref === "") return { selector, x, y };
	const { element } = await elementAt(tabId, { ref, scroll: true });
	const rect = element?.rect;
	if (!rect) throw new Error(`page_error: ref ${ref} is not on the page`);
	return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}
