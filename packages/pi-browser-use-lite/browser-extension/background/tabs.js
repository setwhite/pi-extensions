/**
 * 标签页管理：查询、新建、置前、关闭、分组、导航与等加载、会话标签台账。
 * 组 id 按 sessionKey 分开存：service worker 被回收后还能找回同一个组。
 */

import { sendCommand } from "./input/debugger.js";

/** storage.session 里存组 id 的键前缀，后面接 sessionKey。 */
const GROUP_KEY_PREFIX = "tabs.groupId.";

/** 正在创建、还没入组的标签。 */
export const pendingTabCreations = new Set();

/**
 * 列出本会话组里的标签。用户拖出组的标签不在结果里。
 * @param {object} params
 * @param {string} params.sessionKey 会话标识
 * @returns {Promise<Array<{ id: number, active: boolean, groupId: number, title: string, url: string }>>}
 */
export async function listTabs({ sessionKey } = {}) {
	requireSessionKey(sessionKey);
	const groupId = await readGroupId(sessionKey);
	if (groupId === undefined) return [];
	const tabs = await chrome.tabs.query({ groupId });
	return tabs.map(formatTab);
}

/**
 * 建一个标签并加入本会话组。
 * 入组、写台账或读回失败时关闭该标签，再把错误上抛。
 * @param {object} params
 * @param {string} params.sessionKey 会话标识
 * @param {string} [params.url] 要打开的地址，缺省 about:blank
 * @param {string} params.groupName 组标题，来自配置 chrome.groupName
 * @param {string} params.groupColor 组颜色，来自配置 chrome.groupColor
 * @param {boolean} [params.background] 为 true 时建后台标签，不抢前台
 * @returns {Promise<{ id: number, active: boolean, groupId: number, title: string, url: string }>}
 */
export async function newTab({
	sessionKey,
	url,
	groupName,
	groupColor,
	background = false,
} = {}) {
	requireSessionKey(sessionKey);
	requireGroupSettings(groupName, groupColor);
	const creation = createAndTrack(
		sessionKey,
		url ?? "about:blank",
		groupName,
		groupColor,
		background,
	);
	pendingTabCreations.add(creation);
	try {
		return await creation;
	} finally {
		pendingTabCreations.delete(creation);
	}
}

/**
 * 激活标签。后台模式是硬策略：直接抛错，不碰 chrome.tabs.update。
 * @param {object} params
 * @param {number} params.tabId 标签 id
 * @param {boolean} [params.background] 为 true 时拒绝激活
 * @returns {Promise<{ id: number, active: boolean, groupId: number, title: string, url: string }>}
 */
export async function activateTab({ tabId, background = false } = {}) {
	if (background) throw new Error("background mode blocks tab.activate");
	return formatTab(await chrome.tabs.update(tabId, { active: true }));
}

/**
 * 导航到地址并等加载完成。带 initScript 时在导航前注册、完成后移除，
 * 脚本只在本次导航的文档开始前执行一次。
 * @param {object} params
 * @param {number} params.tabId 标签 id
 * @param {string} params.url 要打开的地址
 * @param {string} [params.initScript] 文档开始前执行的脚本
 * @param {number} params.timeoutMs 等待上限，来自配置 timing.navigateTimeoutMs
 * @returns {Promise<{ id: number, active: boolean, groupId: number, title: string, url: string }>}
 */
export async function navigateTab({ tabId, url, initScript, timeoutMs } = {}) {
	if (timeoutMs === undefined) throw new Error("timeoutMs is required");
	let identifier;
	if (initScript) {
		const added = await sendCommand(
			tabId,
			"Page.addScriptToEvaluateOnNewDocument",
			{ source: initScript },
		);
		identifier = added?.identifier;
	}
	const load = waitForLoad(tabId, timeoutMs);
	try {
		await chrome.tabs.update(tabId, { url });
		await load.promise;
	} catch (error) {
		// 更新失败时没人再等加载，取消等待，别让超时变成未处理的 rejection。
		load.cancel();
		throw error;
	} finally {
		if (identifier !== undefined)
			await sendCommand(tabId, "Page.removeScriptToEvaluateOnNewDocument", {
				identifier,
			});
	}
	return formatTab(await chrome.tabs.get(tabId));
}

/** 等标签加载完成。监听先挂上再导航，避免错过 complete。cancel 可重复调用。 */
function waitForLoad(tabId, timeoutMs) {
	let cancel;
	const promise = new Promise((resolve, reject) => {
		const listener = (updatedTabId, changeInfo) => {
			if (updatedTabId !== tabId || changeInfo.status !== "complete") return;
			cancel();
			resolve();
		};
		const timer = setTimeout(() => {
			cancel();
			reject(
				new Error(
					`timeout: tab ${tabId} did not finish loading within ${timeoutMs}ms`,
				),
			);
		}, timeoutMs);
		cancel = () => {
			clearTimeout(timer);
			chrome.tabs.onUpdated.removeListener(listener);
		};
		chrome.tabs.onUpdated.addListener(listener);
	});
	return { promise, cancel };
}

/**
 * 关闭标签。
 * @param {object} params
 * @param {number} params.tabId 标签 id
 * @returns {Promise<{ closed: number }>}
 */
export async function closeTab({ tabId } = {}) {
	await chrome.tabs.remove(tabId);
	return { closed: tabId };
}

/**
 * 把已有标签加进本会话组，并写入组标题与颜色。
 * @param {object} params
 * @param {string} params.sessionKey 会话标识
 * @param {number} params.tabId 标签 id
 * @param {string} params.groupName 组标题，来自配置 chrome.groupName
 * @param {string} params.groupColor 组颜色，来自配置 chrome.groupColor
 * @returns {Promise<{ id: number, active: boolean, groupId: number, title: string, url: string }>}
 */
export async function groupTab({
	sessionKey,
	tabId,
	groupName,
	groupColor,
} = {}) {
	requireSessionKey(sessionKey);
	requireGroupSettings(groupName, groupColor);
	const tab = await chrome.tabs.get(tabId);
	const groupId = await groupIntoSession(
		sessionKey,
		tab,
		groupName,
		groupColor,
	);
	await writeGroupId(sessionKey, groupId);
	return formatTab(await chrome.tabs.get(tabId));
}

async function createAndTrack(
	sessionKey,
	url,
	groupName,
	groupColor,
	background,
) {
	const tab = await chrome.tabs.create({ url, active: !background });
	try {
		const groupId = await groupIntoSession(
			sessionKey,
			tab,
			groupName,
			groupColor,
		);
		await writeGroupId(sessionKey, groupId);
		return formatTab(await chrome.tabs.get(tab.id));
	} catch (error) {
		await chrome.tabs.remove(tab.id);
		throw error;
	}
}

/** 把标签加进会话组。组不在时在标签自己的窗口里新建，并写入标题与颜色。 */
async function groupIntoSession(sessionKey, tab, groupName, groupColor) {
	const existing = await readGroupId(sessionKey);
	const groupId =
		existing !== undefined && (await groupExists(existing))
			? await chrome.tabs.group({ groupId: existing, tabIds: [tab.id] })
			: await chrome.tabs.group({
					tabIds: [tab.id],
					createProperties: { windowId: await windowIdOf(tab) },
				});
	await chrome.tabGroups.update(groupId, {
		title: groupName,
		color: groupColor,
	});
	return groupId;
}

/** 新标签的对象不一定带 windowId：不带时读回来，组才不会建到别的窗口里。 */
async function windowIdOf(tab) {
	if (typeof tab.windowId === "number") return tab.windowId;
	const stored = await chrome.tabs.get(tab.id);
	return stored.windowId;
}

/** 组随最后一个标签关闭而消失。查现有组而不是 get，避开「组不存在」的错误文案。 */
async function groupExists(groupId) {
	const groups = await chrome.tabGroups.query({});
	return groups.some((group) => group.id === groupId);
}

function requireSessionKey(sessionKey) {
	if (!sessionKey) throw new Error("sessionKey is required");
}

function requireGroupSettings(groupName, groupColor) {
	if (!groupName || !groupColor)
		throw new Error("groupName and groupColor are required");
}

async function readGroupId(sessionKey) {
	const key = `${GROUP_KEY_PREFIX}${sessionKey}`;
	const stored = await chrome.storage.session.get(key);
	const groupId = stored[key];
	return typeof groupId === "number" ? groupId : undefined;
}

async function writeGroupId(sessionKey, groupId) {
	await chrome.storage.session.set({
		[`${GROUP_KEY_PREFIX}${sessionKey}`]: groupId,
	});
}

function formatTab(tab) {
	return {
		id: tab.id,
		active: Boolean(tab.active),
		groupId: tab.groupId,
		title: tab.title ?? "",
		url: tab.url ?? "",
	};
}
