import { evaluate, sendCommand } from "./debugger.js";

/** 页面里第一个文件输入。 */
const FILE_INPUT = `document.querySelector('input[type="file"]')`;

/**
 * 上传文件：截获 file chooser，把路径挂到页面报告的文件输入上。不弹系统对话框。
 * @param {object} params
 * @param {number} params.tabId 标签 id
 * @param {string[]} params.paths 宿主机上的绝对路径
 * @param {number} params.timeoutMs 等 file chooser 的上限
 * @returns {Promise<{ uploaded: string[] }>}
 */
export async function upload({ tabId, paths, timeoutMs } = {}) {
	requirePaths(paths);
	if (
		typeof timeoutMs !== "number" ||
		!Number.isFinite(timeoutMs) ||
		timeoutMs <= 0
	)
		throw new Error("bad_args: timeoutMs must be a positive number");
	await sendCommand(tabId, "Page.enable");
	await sendCommand(tabId, "Page.setInterceptFileChooserDialog", {
		enabled: true,
	});
	const chooser = waitForChooser(tabId, timeoutMs);
	try {
		const activated = await evaluate(
			tabId,
			`(() => { const input = ${FILE_INPUT}; if (!input) return false; input.click(); return true; })()`,
			{ userGesture: true },
		);
		if (activated !== true)
			throw new Error("page_error: page has no input[type=file]");
		const waited = await chooser.promise;
		if (waited.timedOut)
			throw new Error(`timeout: no file chooser opened within ${timeoutMs}ms`);
		const { opened } = waited;
		if (typeof opened?.backendNodeId !== "number")
			throw new Error("page_error: file chooser opened without an input node");
		await sendCommand(tabId, "DOM.setFileInputFiles", {
			backendNodeId: opened.backendNodeId,
			files: paths,
		});
		return { uploaded: paths };
	} finally {
		chooser.cancel();
		await sendCommand(tabId, "Page.setInterceptFileChooserDialog", {
			enabled: false,
		});
	}
}

/**
 * 等本标签的 file chooser 打开。promise 只 resolve，超时作为 `{ timedOut: true }` 返回：
 * 触发点击先抛错时没有人 await 它，reject 会变成未处理的 rejection。
 * @param {number} tabId 标签 id
 * @param {number} timeoutMs 超时上限
 * @returns {{
 *   promise: Promise<{ timedOut?: true, opened?: Record<string, unknown> }>,
 *   cancel: () => void,
 * }}
 */
function waitForChooser(tabId, timeoutMs) {
	let timer;
	let listener;
	const promise = new Promise((resolve) => {
		timer = setTimeout(() => resolve({ timedOut: true }), timeoutMs);
		listener = (source, method, params) => {
			if (method !== "Page.fileChooserOpened" || source?.tabId !== tabId)
				return;
			clearTimeout(timer);
			resolve({ opened: params });
		};
		chrome.debugger.onEvent.addListener(listener);
	});
	return {
		promise,
		cancel: () => {
			clearTimeout(timer);
			chrome.debugger.onEvent.removeListener(listener);
		},
	};
}

function requirePaths(paths) {
	if (!Array.isArray(paths) || paths.length === 0)
		throw new Error("bad_args: paths must be a non-empty array");
	for (const path of paths) {
		if (typeof path !== "string" || path === "")
			throw new Error("bad_args: every path must be a non-empty string");
	}
}
