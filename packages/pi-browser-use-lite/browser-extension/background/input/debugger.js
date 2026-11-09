/**
 * 调试器通道：按标签缓存 attach，发原始 CDP 命令。
 * 只碰 chrome.debugger；不激活标签，不做 DOM 假事件回退（DEC-0007）。
 */

/** 已挂上的标签。attach 每次都要走一次 API，缓存省掉往返。 */
const attachedTabs = new Set();

/**
 * 我们主动摘过几次调试器。摘下之后残留的 CDP 调用会报 Detached，
 * 那不是会话丢了，别自愈重挂——那会把已经放弃的命令重新跑起来。
 */
let released = 0;

/**
 * 摘掉所有调试器。命令被放弃时用它取消：CDP 没有别的取消手段，
 * 摘掉之后正在等的调用会立刻以 Detached 失败。
 */
export async function releaseAll() {
	released += 1;
	const tabs = [...attachedTabs];
	attachedTabs.clear();
	for (const tabId of tabs) {
		try {
			await chrome.debugger.detach({ tabId });
		} catch {
			// 已经在的标签没有可摘的会话，这正是想要的状态。
		}
	}
}

/** chrome.scripting 因权限拒绝时的文案。Chrome 在不同页面上报的四种。 */
const SCRIPTING_DENIED =
	/Cannot access contents of url|Cannot access .+ at origin|Extension manifest must request permission|matchAboutBlank must be true/i;

/**
 * 挂上标签的调试器。已挂过就直接返回。
 * @param {number} tabId 标签 id
 * @returns {Promise<void>}
 */
export async function attach(tabId) {
	requireDebugger();
	if (attachedTabs.has(tabId)) return;
	try {
		await chrome.debugger.attach({ tabId }, "1.3");
	} catch (error) {
		// 挂不上的原因（开发者工具占着、别的扩展占着）只有这一处能说清。
		throw new Error(`cdp_unavailable: ${errorMessage(error)}`);
	}
	attachedTabs.add(tabId);
}

/**
 * 发一条原始 CDP 命令。会话被浏览器收回时自愈一次。
 * @param {number} tabId 标签 id
 * @param {string} method CDP 方法名
 * @param {Record<string, unknown>} [params] CDP 参数
 * @returns {Promise<unknown>} CDP 的返回
 */
export async function sendCommand(tabId, method, params) {
	await attach(tabId);
	const generation = released;
	try {
		return await chrome.debugger.sendCommand({ tabId }, method, params);
	} catch (error) {
		// 自己摘掉的不算会话丢了：重挂只会让放弃掉的命令接着跑。
		if (!isSessionGone(error) || generation !== released) throw error;
		await reconnect(tabId);
		return chrome.debugger.sendCommand({ tabId }, method, params);
	}
}

/**
 * 在页面里求值一次，返回结果值。
 * @param {number} tabId 标签 id
 * @param {string} expression JavaScript 表达式
 * @param {{ userGesture?: boolean, awaitPromise?: boolean }} [options] `userGesture` 给页面一次用户激活，`awaitPromise` 等 Promise
 * @returns {Promise<unknown>} 求值结果
 */
export async function evaluate(tabId, expression, options = {}) {
	const response = await sendCommand(tabId, "Runtime.evaluate", {
		expression,
		returnByValue: true,
		userGesture: options.userGesture === true,
		awaitPromise: options.awaitPromise === true,
	});
	if (response?.exceptionDetails)
		throw new Error(
			`page_error: ${exceptionMessage(response.exceptionDetails)}`,
		);
	return response?.result?.value;
}

/**
 * 跑 executeScript；被权限拒绝时改走 CDP 的 Runtime.evaluate。
 * @param {object} options
 * @param {number} options.tabId 标签 id
 * @param {Function} options.func 要注入页面的函数
 * @param {unknown[]} [options.args] 函数的参数
 * @param {string} [options.world] 执行世界
 * @returns {Promise<unknown>} 与 chrome.scripting.executeScript 同形：`[{ result }]`
 */
export async function executeScriptWithFallback({
	tabId,
	func,
	args = [],
	world = "MAIN",
}) {
	try {
		return await chrome.scripting.executeScript({
			target: { tabId },
			func,
			args,
			world,
		});
	} catch (error) {
		if (!isAccessDenied(error)) throw error;
		const response = await sendCommand(tabId, "Runtime.evaluate", {
			expression: `(${func.toString()})(...${jsonArgs(args)})`,
			returnByValue: true,
			awaitPromise: true,
		});
		if (response.exceptionDetails)
			throw new Error(exceptionMessage(response.exceptionDetails));
		return [{ result: response.result?.value }];
	}
}

/**
 * 把注入目录里的经典脚本送进页面。被权限拒绝时读源码改走 CDP。
 * @param {object} options
 * @param {number} options.tabId 标签 id
 * @param {string} options.path 相对扩展根目录的路径
 * @param {string} [options.world] 执行世界
 * @returns {Promise<unknown>} 与 chrome.scripting.executeScript 同形
 */
export async function injectScriptFile({ tabId, path, world = "MAIN" }) {
	try {
		return await chrome.scripting.executeScript({
			target: { tabId },
			files: [path],
			world,
		});
	} catch (error) {
		if (!isAccessDenied(error)) throw error;
		await evaluate(tabId, await readScriptSource(path));
		return [{ result: undefined }];
	}
}

/** 读扩展自己的脚本源码；扩展资源不受页面 CSP 管。 */
async function readScriptSource(path) {
	const response = await fetch(chrome.runtime.getURL(path));
	return await response.text();
}

/** 会话失效的自愈：清缓存，detach 残留，再挂一次。只重试一次由调用方保证。 */
async function reconnect(tabId) {
	attachedTabs.delete(tabId);
	try {
		await chrome.debugger.detach({ tabId });
	} catch (error) {
		// 残留条目可能已经不在。只有「没挂上」可以吞，其它错误照抛。
		if (!isNotAttached(error)) throw error;
	}
	await attach(tabId);
}

/**
 * 取页面异常的首行原文。Chrome 把 `text` 写成 `Uncaught`，原文在 `exception.description`。
 * @param {{ exception?: { description?: string, value?: unknown }, text?: string }} details 异常详情
 * @returns {string} 首行
 */
function exceptionMessage(details) {
	const raw =
		details?.exception?.description ??
		details?.exception?.value ??
		details?.text ??
		"evaluation failed";
	return String(raw).split("\n")[0];
}

function errorMessage(error) {
	return error instanceof Error ? error.message : String(error);
}

function isSessionGone(error) {
	const message = errorMessage(error);
	return message.includes("Detached") || message.includes("not attached");
}

function isNotAttached(error) {
	return errorMessage(error).includes("not attached");
}

function isAccessDenied(error) {
	return SCRIPTING_DENIED.test(errorMessage(error));
}

function jsonArgs(args) {
	try {
		return JSON.stringify(args);
	} catch (error) {
		throw new Error("args must be JSON-serializable", { cause: error });
	}
}

function requireDebugger() {
	if (!chrome.debugger) throw new Error("chrome.debugger is not available");
}
