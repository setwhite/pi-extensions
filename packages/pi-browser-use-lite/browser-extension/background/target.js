/**
 * 自动化 target 归属：每个 sessionKey 一个 target 标签，台账写两处存储。
 */

import {
	readRecord,
	removeRecord,
	valuesWithPrefix,
	writeRecord,
} from "./ledger.js";
import { forgetSessionWindow, newTab, sessionWindowId } from "./tabs.js";

export const TARGET_KEY_PREFIX = "target.tabId.";
export const OWNED_KEY_PREFIX = "target.owned.";

/**
 * 建一个新标签当本会话的 target，记进台账。`chrome_tab new` 走这里。
 * @param {object} params
 * @param {string} params.sessionKey 会话标识
 * @param {string} [params.url] 新标签的地址
 * @returns {Promise<number>} 新 target 的标签 id
 */
export async function createTarget({ sessionKey, url } = {}) {
	requireSessionKey(sessionKey);

	const tab = await newTab({ sessionKey, url });
	await writeRecord(TARGET_KEY_PREFIX + sessionKey, tab.id);
	const owned = await readOwned(sessionKey);
	await writeRecord(OWNED_KEY_PREFIX + sessionKey, [...owned, tab.id]);
	return tab.id;
}

/**
 * 取本会话的自动化 target。没有活着的 target 时只有 `page.navigate` 会建一个。
 * @param {object} params
 * @param {string} params.sessionKey 会话标识
 * @param {string} params.action 动作名，决定能不能顺手建 target
 * @param {string} [params.url] 建新标签时的地址
 * @returns {Promise<number>} target 标签 id
 */
export async function targetFor({ sessionKey, action } = {}) {
	requireSessionKey(sessionKey);
	if (!action) throw new Error("action is required");

	const tabId = await readRecord(TARGET_KEY_PREFIX + sessionKey);
	if (await isTarget(sessionKey, tabId)) return tabId;
	if (action !== "page.navigate")
		throw new Error(
			`no_target: no automation target for session ${sessionKey}`,
		);

	return createTarget({ sessionKey });
}

/**
 * 会话结束：清掉本会话的台账。`closeOwnTabs` 为真时连本会话创建的标签一起关。
 * @param {object} params
 * @param {string} params.sessionKey 会话标识
 * @param {boolean} params.closeOwnTabs 关不关本会话创建的标签，来自配置 policy.closeOwnTabsOnExit
 * @returns {Promise<{ closed: number[] }>} 这次关掉的标签 id
 */
export async function cleanupAutomation({ sessionKey, closeOwnTabs } = {}) {
	requireSessionKey(sessionKey);
	if (typeof closeOwnTabs !== "boolean")
		throw new Error("closeOwnTabs is required");

	const closed = [];
	if (closeOwnTabs) {
		for (const tabId of await readOwned(sessionKey)) {
			if (await isTarget(sessionKey, tabId)) closed.push(tabId);
		}
	}
	if (closed.length > 0) await chrome.tabs.remove(closed);

	await removeRecord(TARGET_KEY_PREFIX + sessionKey);
	await removeRecord(OWNED_KEY_PREFIX + sessionKey);
	await forgetSessionWindow(sessionKey);
	return { closed };
}

/** 标签还在，且仍在本会话的窗口里。 */
async function isTarget(sessionKey, tabId) {
	if (!Number.isInteger(tabId)) return false;
	const windowId = await sessionWindowId(sessionKey);
	if (windowId === undefined) return false;
	const tab = await chrome.tabs.get(tabId).catch(() => null);
	return tab !== null && tab.windowId === windowId;
}

/**
 * 台账里所有会话的 target 标签 id。日志抓取只挂这些标签，不动用户自己的标签。
 * @returns {Promise<Set<number>>} 标签 id
 */
export async function trackedTabIds() {
	const values = await valuesWithPrefix(TARGET_KEY_PREFIX);
	return new Set(values.filter((value) => Number.isInteger(value)));
}

function requireSessionKey(sessionKey) {
	if (!sessionKey) throw new Error("sessionKey is required");
}

async function readOwned(sessionKey) {
	const stored = await readRecord(OWNED_KEY_PREFIX + sessionKey);
	return Array.isArray(stored) ? stored : [];
}
