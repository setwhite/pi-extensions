/**
 * 自动化 target 归属：每个 sessionKey 一个 target 标签，台账写两处存储。
 */

import { newTab } from "./tabs.js";

const TARGET_KEY_PREFIX = "target.tabId.";
const GROUP_KEY_PREFIX = "target.group.";
const OWNED_KEY_PREFIX = "target.owned.";

/**
 * 建一个新标签当本会话的 target，记进台账。`chrome_tab new` 走这里。
 * @param {object} params
 * @param {string} params.sessionKey 会话标识
 * @param {string} [params.url] 新标签的地址
 * @param {string} params.groupName 组标题，来自配置 chrome.groupName
 * @param {string} params.groupColor 组颜色，来自配置 chrome.groupColor
 * @param {boolean} [params.background] 为 true 时新标签不抢前台
 * @returns {Promise<number>} 新 target 的标签 id
 */
export async function createTarget({
	sessionKey,
	url,
	groupName,
	groupColor,
	background = false,
} = {}) {
	requireSessionKey(sessionKey);

	const tab = await newTab({
		sessionKey,
		url,
		groupName,
		groupColor,
		background,
	});
	if (!Number.isInteger(tab.groupId) || tab.groupId < 0)
		throw new Error(`target tab ${tab.id} is not in the session group`);

	await writeRecord(TARGET_KEY_PREFIX + sessionKey, tab.id);
	await writeRecord(GROUP_KEY_PREFIX + sessionKey, tab.groupId);
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
 * @param {string} params.groupName 组标题，来自配置 chrome.groupName
 * @param {string} params.groupColor 组颜色，来自配置 chrome.groupColor
 * @param {boolean} [params.background] 为 true 时新建的标签不抢前台
 * @returns {Promise<number>} target 标签 id
 */
export async function targetFor({
	sessionKey,
	action,
	url,
	groupName,
	groupColor,
	background = false,
} = {}) {
	requireSessionKey(sessionKey);
	if (!action) throw new Error("action is required");

	const tabId = await readRecord(TARGET_KEY_PREFIX + sessionKey);
	const groupId = await readRecord(GROUP_KEY_PREFIX + sessionKey);
	if (await isTarget(tabId, groupId)) return tabId;
	if (action !== "page.navigate")
		throw new Error(
			`no_target: no automation target for session ${sessionKey}`,
		);

	return createTarget({ sessionKey, url, groupName, groupColor, background });
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

	const groupId = await readRecord(GROUP_KEY_PREFIX + sessionKey);
	const openTabs = closeOwnTabs ? await chrome.tabs.query({}) : [];
	const closed = (await readOwned(sessionKey)).filter((tabId) =>
		openTabs.some((tab) => tab.id === tabId && isInGroup(tab, groupId)),
	);
	if (closed.length > 0) await chrome.tabs.remove(closed);

	for (const prefix of [TARGET_KEY_PREFIX, GROUP_KEY_PREFIX, OWNED_KEY_PREFIX])
		await removeRecord(prefix + sessionKey);
	return { closed };
}

function requireSessionKey(sessionKey) {
	if (!sessionKey) throw new Error("sessionKey is required");
}

/** 标签还在，且仍在本次会话的组里。 */
function isInGroup(tab, groupId) {
	return (
		Number.isInteger(groupId) && tab !== undefined && tab.groupId === groupId
	);
}

async function isTarget(tabId, groupId) {
	if (!Number.isInteger(tabId)) return false;
	const tabs = await chrome.tabs.query({});
	return tabs.some((tab) => tab.id === tabId && isInGroup(tab, groupId));
}

async function readOwned(sessionKey) {
	const stored = await readRecord(OWNED_KEY_PREFIX + sessionKey);
	return Array.isArray(stored) ? stored : [];
}

async function writeRecord(key, value) {
	await chrome.storage.session.set({ [key]: value });
	await chrome.storage.local.set({ [key]: value });
}

async function removeRecord(key) {
	await chrome.storage.session.remove(key);
	await chrome.storage.local.remove(key);
}

async function readRecord(key) {
	for (const area of [chrome.storage.session, chrome.storage.local]) {
		const stored = await area.get(key);
		if (stored[key] !== undefined) return stored[key];
	}
	return undefined;
}
