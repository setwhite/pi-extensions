import { releaseAll } from "./input/debugger.js";

/**
 * 桥的默认地址。host_permissions 覆盖 127.0.0.1 的任意端口，但端口要扩展自己知道：
 * 改 `bridge.port` 时这里也要改，否则轮询找不到桥。
 */
const BRIDGE_URL = "http://127.0.0.1:17318";

/** 桥没给命令时，两次 `/next` 之间的间隔。 */
const POLL_INTERVAL_MS = 100;

/**
 * 单次请求的时限。桥把 `/next` 挂起 25 秒，超过这个时限说明连接已经半死
 * （机器睡眠、桥所在进程被冻住），不会再有应答。
 */
const REQUEST_TIMEOUT_MS = 45_000;

/** 报自身版本用的请求头。名字与 src/protocol 的 `EXTENSION_VERSION_HEADER` 一致，测试比对两处。 */
export const VERSION_HEADER = "x-pi-browser-use-version";

/** 桥在 `/next` 应答里报的期望版本。名字与 src/protocol 的 `HOST_VERSION_HEADER` 一致，测试比对两处。 */
export const HOST_VERSION_HEADER = "x-pi-browser-use-host-version";

/** 上次为哪个期望版本重载过自己。磁盘上仍是旧代码时，靠它避免每秒重载一次。 */
const RELOADED_KEY = "transport.reloadedFor";

/**
 * 起轮询：反复问桥要命令，取到就交给 dispatch，再把结果回传。
 * 有命令时立刻再问；拿到 `none` 就等 pollIntervalMs 再问。
 * 请求失败或超时后循环结束，由入口的 1 秒定时器或 alarm 重起。
 * 版本随每次请求报给桥，重载扩展后下一次请求就换成新版本。
 * @param {object} options
 * @param {string} [options.url] 桥的地址
 * @param {number} [options.pollIntervalMs] 没命令时的间隔
 * @param {number} [options.requestTimeoutMs] 单次请求的时限
 * @param {string} options.version 扩展版本
 * @param {(action: string, params?: Record<string, unknown>) => unknown} options.dispatch 动作路由
 * @returns {{ stop: () => void, done: Promise<void> }} stop 中止当前请求；done 在循环结束时 resolve
 */
export function startTransport({
	url = BRIDGE_URL,
	pollIntervalMs = POLL_INTERVAL_MS,
	requestTimeoutMs = REQUEST_TIMEOUT_MS,
	version,
	dispatch,
}) {
	const controller = new AbortController();
	return { stop: () => controller.abort(), done: run() };

	async function run() {
		while (!controller.signal.aborted) {
			let next;
			try {
				next = await nextCommand();
			} catch {
				return;
			}
			if (next === undefined) {
				await sleep(pollIntervalMs);
				continue;
			}
			const body = await answer(next);
			try {
				await postResult(body);
			} catch {
				return;
			}
		}
	}

	async function nextCommand() {
		const response = await request("/next");
		if (!response.ok)
			throw new Error(`the bridge answered HTTP ${response.status}`);
		if (await outdated(response)) {
			// 重载会带走这个循环；先停掉它，别再向后来的自己发请求。
			controller.abort();
			return undefined;
		}
		const body = await response.json();
		return body.type === "command" ? body.command : undefined;
	}

	/**
	 * 桥期望的版本与自身不同就重载自己。只重载一次：磁盘上仍是旧代码时，重载换不来新版本。
	 * @returns {Promise<boolean>} 是否已触发重载
	 */
	async function outdated(response) {
		const expected = response.headers.get(HOST_VERSION_HEADER);
		if (!expected || expected === version) return false;
		const remembered = await chrome.storage.local.get(RELOADED_KEY);
		if (remembered?.[RELOADED_KEY] === expected)
			throw new Error(
				`the extension is on version ${version} but the bridge expects ${expected}; reload the unpacked extension by hand`,
			);
		await chrome.storage.local.set({ [RELOADED_KEY]: expected });
		chrome.runtime.reload();
		return true;
	}

	/**
	 * 跑一条命令，超过桥给的时限就放弃它。
	 * 不放弃的话，一次卡住的 CDP 调用会把整个轮询钉死，后面所有命令都取不走。
	 * @param {{ id: string, action: string, params?: Record<string, unknown>, remainingMs: number }} command 桥交给的命令
	 */
	async function answer(command) {
		const limit = command.remainingMs;
		if (!Number.isFinite(limit) || limit <= 0)
			return {
				id: command.id,
				ok: false,
				error: {
					class: "timeout",
					message: "the command expired before the extension started it",
				},
			};
		// 先把同步抛出的错误也变成 rejection，下面统一按一条路径收尾。
		const work = (async () => dispatch(command.action, command.params))();
		// 放弃之后它仍会失败，吞掉，别留一个没人处理的 rejection。
		work.catch(() => {});
		try {
			return {
				id: command.id,
				ok: true,
				result: await withDeadline(work, limit),
			};
		} catch (error) {
			if (error !== EXPIRED)
				return {
					id: command.id,
					ok: false,
					error: failure(
						error instanceof Error ? error.message : String(error),
					),
				};
			await releaseAll();
			return {
				id: command.id,
				ok: false,
				error: {
					class: "timeout",
					message: `${command.action} did not finish within ${limit}ms; the debugger was detached, so the page may be half changed`,
				},
			};
		}
	}

	async function postResult(body) {
		await request("/result", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
		});
	}

	/** 一次请求。超时与 stop 都中止它。 */
	async function request(path, init) {
		const deadline = new AbortController();
		const timer = setTimeout(() => deadline.abort(), requestTimeoutMs);
		const onStop = () => deadline.abort();
		controller.signal.addEventListener("abort", onStop);
		try {
			return await fetch(`${url}${path}`, {
				...init,
				headers: { ...init?.headers, [VERSION_HEADER]: version },
				signal: deadline.signal,
			});
		} finally {
			clearTimeout(timer);
			controller.signal.removeEventListener("abort", onStop);
		}
	}
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 把一次失败折成桥要的 `{ class, message }`。
 * 扩展内部沿用 `<class>: ` 前缀（与 src/ 一致），只在这里解析一次；没有前缀就当 page_error 的原因。
 * 类别表在 src/protocol，桥还会再校验一次：这里认错的类别不会漏到模型手里。
 * @param {string} message 抛出的消息
 * @returns {{ class: string, message: string }}
 */
function failure(message) {
	const match = /^([a-z_]+): (.*)$/s.exec(message);
	if (match === null) return { class: "page_error", message };
	return { class: match[1], message: match[2] };
}

/** 到期的标记。用同一个对象比字符串可靠：命令自己也可能抛 "timeout:"。 */
const EXPIRED = Symbol("expired");

/**
 * 给一个已经在跑的 Promise 加上限。
 * 到期只是不再等它，它自己会由 {@link releaseAll} 取消。
 * @template T
 * @param {Promise<T>} promise 被等的 Promise
 * @param {number} ms 上限
 * @returns {Promise<T>}
 */
function withDeadline(promise, ms) {
	let timer;
	const deadline = new Promise((_resolve, reject) => {
		timer = setTimeout(() => reject(EXPIRED), ms);
	});
	return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}
