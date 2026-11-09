import { sendCommand } from "./input/debugger.js";
import { readRecord, removeRecord, writeRecord } from "./ledger.js";

/** 台账里存会话窗口 id 的键前缀，后面接 sessionKey。 */
export const WINDOW_KEY_PREFIX = "tabs.windowId.";

/**
 * 列出本会话窗口里的标签。
 * @param {object} params
 * @param {string} params.sessionKey 会话标识
 * @returns {Promise<Array<{ id: number, active: boolean, title: string, url: string }>>}
 */
export async function listTabs({ sessionKey } = {}) {
	requireSessionKey(sessionKey);
	const windowId = await sessionWindowId(sessionKey);
	if (windowId === undefined) return [];
	const tabs = await chrome.tabs.query({ windowId });
	return tabs.map(formatTab);
}

/**
 * 在本会话窗口里建一个标签。窗口不在时先建窗口，顺手用它带的那个标签，不留空标签。
 * @param {object} params
 * @param {string} params.sessionKey 会话标识
 * @param {string} [params.url] 要打开的地址，缺省 about:blank
 * @returns {Promise<{ id: number, active: boolean, title: string, url: string }>}
 */
export async function newTab({ sessionKey, url } = {}) {
	requireSessionKey(sessionKey);
	const windowId = await liveWindowId(sessionKey);
	if (windowId !== undefined) {
		// 新标签在自己的窗口里就是活动标签。激活标签不改变窗口焦点，不会打扰用户。
		const tab = await chrome.tabs.create({
			windowId,
			url: url ?? "about:blank",
			active: true,
		});
		return formatTab(await chrome.tabs.get(tab.id));
	}
	// 建窗口不给 url：Vivaldi 的 chrome.windows.create({ url }) 承诺不 resolve，命令会挂到服务工作进程被回收。
	const opened = await chrome.windows.create({ focused: false });
	await writeRecord(WINDOW_KEY_PREFIX + sessionKey, opened.id);
	const tab =
		firstTabOf(opened) ?? (await chrome.tabs.query({ windowId: opened.id }))[0];
	if (url !== undefined) await chrome.tabs.update(tab.id, { url });
	return formatTab(await chrome.tabs.get(tab.id));
}

/**
 * 激活标签，并把它所在的窗口带到前台。
 * @param {object} params
 * @param {number} params.tabId 标签 id
 * @returns {Promise<{ id: number, active: boolean, title: string, url: string }>}
 */
export async function activateTab({ tabId } = {}) {
	const tab = await chrome.tabs.update(tabId, { active: true });
	await chrome.windows.update(tab.windowId, { focused: true });
	return formatTab(tab);
}

/**
 * 导航到地址并等加载完成。带 initScript 时在导航前注册、完成后移除，
 * 脚本只在本次导航的文档开始前执行一次。
 * @param {object} params
 * @param {number} params.tabId 标签 id
 * @param {string} params.url 要打开的地址
 * @param {string} [params.initScript] 文档开始前执行的脚本
 * @param {number} params.timeoutMs 等待上限，来自配置 timing.navigateTimeoutMs
 * @returns {Promise<{ id: number, active: boolean, title: string, url: string }>}
 */
export async function navigateTab({ tabId, url, initScript, timeoutMs } = {}) {
	if (timeoutMs === undefined)
		throw new Error("bad_args: timeoutMs is required");
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
 * 本会话的窗口 id。没有就返回 undefined，不建窗口。
 * @param {string} sessionKey 会话标识
 * @returns {Promise<number | undefined>}
 */
export async function sessionWindowId(sessionKey) {
	requireSessionKey(sessionKey);
	const windowId = await readRecord(WINDOW_KEY_PREFIX + sessionKey);
	return typeof windowId === "number" ? windowId : undefined;
}

/**
 * 会话结束：清窗口台账。窗口里没标签时浏览器自己会关掉它；还有标签就留着。
 * @param {string} sessionKey 会话标识
 */
export async function forgetSessionWindow(sessionKey) {
	requireSessionKey(sessionKey);
	await removeRecord(WINDOW_KEY_PREFIX + sessionKey);
}

/** 台账里的窗口还在不在。被用户关掉时返回 undefined，下次新建重来。 */
async function liveWindowId(sessionKey) {
	const windowId = await sessionWindowId(sessionKey);
	if (windowId === undefined) return undefined;
	const opened = await chrome.windows.get(windowId).catch(() => null);
	return opened === null ? undefined : windowId;
}

function firstTabOf(opened) {
	const tabs = Array.isArray(opened?.tabs) ? opened.tabs : [];
	return tabs[0];
}

function requireSessionKey(sessionKey) {
	if (!sessionKey) throw new Error("sessionKey is required");
}

function formatTab(tab) {
	return {
		id: tab.id,
		active: Boolean(tab.active),
		title: tab.title ?? "",
		url: tab.url ?? "",
	};
}
