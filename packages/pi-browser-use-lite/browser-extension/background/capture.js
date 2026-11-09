/**
 * 日志捕获：用 CDP 事件流记 console 与 network，按标签存一份。
 * 缓冲区在后台而不是页面里，所以同一标签再导航一次也不会丢。
 */

import { attach, sendCommand } from "./input/debugger.js";
import { trackedTabIds } from "./target.js";

const KEY_PREFIX = "capture.logs.";
const CONSOLE_LIMIT = 500;
const NETWORK_LIMIT = 1_000;
const BODY_LIMIT = 200_000;
/** tabId → { console, network, starts, capturing, offReason, saveError } */
const buffers = new Map();
/** 正在从存储里读的缓冲区。两个调用同时到时共用同一次读，不各建一份。 */
const pending = new Map();
/** tabId → { busy, again }：同一标签同时只写一次，写的过程中来的事件合并成一次补写。 */
const saves = new Map();
let subscribed = false;

subscribe();

/** 事件监听在模块加载时注册，service worker 才会被它们唤醒。 */
function subscribe() {
	const debuggerApi = globalThis.chrome?.debugger;
	if (subscribed || debuggerApi === undefined) return;
	subscribed = true;
	debuggerApi.onEvent.addListener(onEvent);
	debuggerApi.onDetach.addListener(onDetach);
	globalThis.chrome?.tabs?.onRemoved?.addListener(onTabRemoved);
}

/**
 * 在这个标签上开抓。已经开着就只补一次 attach，不重复开域。
 * 挂不上调试器时只记一句说明，不挡动作。
 * @param {number} tabId 标签 id
 * @returns {Promise<void>}
 */
export async function startCapture(tabId) {
	subscribe();
	const buffer = await bufferOf(tabId);
	buffer.offReason = undefined;
	buffer.saveError = undefined;
	try {
		await attach(tabId);
		if (buffer.capturing !== true) {
			await sendCommand(tabId, "Runtime.enable");
			await sendCommand(tabId, "Network.enable");
			buffer.capturing = true;
		}
	} catch (error) {
		buffer.capturing = false;
		buffer.offReason = `capture is off for this tab: ${messageOf(error)}`;
	}
	await save(tabId, buffer);
}

/**
 * `chrome.webNavigation.onCommitted` 的处理。只抓本会话台账里的标签。
 * @param {{ tabId?: number, frameId?: number }} details 导航详情
 * @returns {Promise<void>}
 */
export async function onCommitted({ tabId, frameId } = {}) {
	if (frameId !== 0 || !Number.isInteger(tabId)) return;
	if (!(await trackedTabIds()).has(tabId)) return;
	await startCapture(tabId);
}

/**
 * 读 console 条目，最旧的在前。
 * @param {number} tabId 标签 id
 * @param {{ clear?: boolean }} [options] `clear` 读完清空
 * @returns {Promise<{ records: object[], note?: string }>} 条目与说明
 */
export async function listConsole(tabId, { clear = false } = {}) {
	const buffer = await bufferOf(tabId);
	const records = buffer.console.slice();
	if (clear) {
		buffer.console.length = 0;
		await save(tabId, buffer);
	}
	return withNote(records, buffer);
}

/**
 * 读网络请求，最早的在前。
 * @param {number} tabId 标签 id
 * @param {{ clear?: boolean }} [options] `clear` 读完清空
 * @returns {Promise<{ records: object[], note?: string }>} 请求与说明
 */
export async function listNetwork(tabId, { clear = false } = {}) {
	const buffer = await bufferOf(tabId);
	const records = buffer.network.map((record) => ({ ...record }));
	if (clear) {
		buffer.network.length = 0;
		await save(tabId, buffer);
	}
	return withNote(records, buffer);
}

/**
 * 单条请求的详情，顺带取回响应体。
 * @param {number} tabId 标签 id
 * @param {string} requestId 请求 id
 * @returns {Promise<object>} 请求记录
 */
export async function networkRequest(tabId, requestId) {
	const buffer = await bufferOf(tabId);
	const record = buffer.network.find((entry) => entry.id === requestId);
	if (record === undefined)
		throw new Error(`bad_args: no request with id ${requestId}`);

	const detail = { ...record };
	try {
		const body = await sendCommand(tabId, "Network.getResponseBody", {
			requestId,
		});
		if (body?.base64Encoded === true)
			detail.responseBodyNote = "the response body is binary";
		else if (typeof body?.body === "string")
			detail.responseBody = clipBody(body.body);
	} catch (error) {
		detail.responseBodyNote = `could not read the response body: ${messageOf(error)}`;
	}
	return detail;
}

function onEvent(source, method, params = {}) {
	void handleEvent(source, method, params);
}

/// 调试器事件可能在 startCapture 之前到（service worker 刚醒来），所以先按标签建缓冲区。
async function handleEvent(source, method, params) {
	const tabId = source?.tabId;
	if (!Number.isInteger(tabId)) return;
	const buffer = await bufferOf(tabId);
	if (buffer.offReason !== undefined) return;
	if (method === "Runtime.consoleAPICalled") pushConsole(buffer, params);
	else if (method === "Network.requestWillBeSent") pushRequest(buffer, params);
	else if (method === "Network.responseReceived") markStatus(buffer, params);
	else if (method === "Network.loadingFinished") markDuration(buffer, params);
	else return;
	await saveSoon(tabId, buffer);
}

/** 标签关掉后它的缓冲区与存储键都不会再被读到。 */
function onTabRemoved(tabId) {
	buffers.delete(tabId);
	pending.delete(tabId);
	saves.delete(tabId);
	void chrome.storage.session.remove(KEY_PREFIX + tabId);
}

function onDetach(source, reason) {
	const buffer = buffers.get(source?.tabId);
	if (buffer === undefined) return;
	buffer.capturing = false;
	buffer.offReason = `capture is off for this tab: ${reason}`;
}

function pushConsole(buffer, { type, args = [], timestamp }) {
	buffer.console.push({
		level: levelOf(type),
		text: args.map(textOf).join(" "),
		time: Math.round(timestamp ?? Date.now()),
	});
	if (buffer.console.length > CONSOLE_LIMIT)
		buffer.console.splice(0, buffer.console.length - CONSOLE_LIMIT);
}

function pushRequest(buffer, { requestId, request = {}, timestamp }) {
	const record = {
		id: requestId,
		method: request.method ?? "GET",
		url: request.url ?? "",
		status: undefined,
		durationMs: undefined,
	};
	if (typeof request.postData === "string") {
		record.requestBody = clipBody(request.postData);
		if (record.requestBody !== request.postData)
			record.requestBodyTruncated = true;
	}
	buffer.starts.set(requestId, timestamp);
	buffer.network.push(record);
	if (buffer.network.length > NETWORK_LIMIT)
		buffer.network.splice(0, buffer.network.length - NETWORK_LIMIT);
}

function markStatus(buffer, { requestId, response = {} }) {
	const record = buffer.network.find((entry) => entry.id === requestId);
	if (record !== undefined) record.status = response.status;
}

function markDuration(buffer, { requestId, timestamp }) {
	const record = buffer.network.find((entry) => entry.id === requestId);
	const startedAt = buffer.starts.get(requestId);
	if (record === undefined || startedAt === undefined) return;
	record.durationMs = Math.round((timestamp - startedAt) * 1000);
}

async function bufferOf(tabId) {
	const existing = buffers.get(tabId);
	if (existing !== undefined) return existing;
	let loading = pending.get(tabId);
	if (loading === undefined) {
		const key = KEY_PREFIX + tabId;
		loading = chrome.storage.session.get(key).then((stored) => {
			const saved = stored?.[key] ?? {};
			return {
				console: saved.console ?? [],
				network: saved.network ?? [],
				starts: new Map(Object.entries(saved.starts ?? {})),
				// attach 不跨 service worker 存活。恢复出来一律当没开域，
				// 否则 startCapture 会跳过 Runtime.enable，抓取静默停摆。
				capturing: false,
				offReason: saved.offReason,
				saveError: undefined,
			};
		});
		pending.set(tabId, loading);
	}
	const buffer = await loading;
	// 读的过程中标签被关掉：onTabRemoved 已经删掉 pending，别再把它缓存回来。
	if (!pending.delete(tabId)) return buffer;
	buffers.set(tabId, buffer);
	return buffer;
}

/**
 * 把缓冲区写进 storage.session。写入被拒（配额满、存储不可用）时不抛：
 * 抓取继续在内存里，读的时候把原因带出去。
 */
async function save(tabId, buffer) {
	// 标签已关：在途的写不要再把键写回去。
	if (!buffers.has(tabId)) return;
	try {
		await chrome.storage.session.set({
			[KEY_PREFIX + tabId]: {
				console: buffer.console,
				network: buffer.network,
				starts: Object.fromEntries(buffer.starts),
				offReason: buffer.offReason,
			},
		});
		buffer.saveError = undefined;
	} catch (error) {
		buffer.saveError = `the log buffer is not being saved: ${messageOf(error)}`;
	}
}

/**
 * 事件驱动的落盘：同一标签同时只写一次。写的过程中来的事件只留一个「补写」标记，
 * 一次突发因此最多写两次，而不是每个事件都序列化整份缓冲区。
 */
async function saveSoon(tabId, buffer) {
	const state = saves.get(tabId) ?? { busy: false, again: false };
	saves.set(tabId, state);
	if (state.busy) {
		state.again = true;
		return;
	}
	state.busy = true;
	try {
		do {
			state.again = false;
			await save(tabId, buffer);
		} while (state.again);
	} finally {
		state.busy = false;
		saves.delete(tabId);
	}
}

function withNote(records, buffer) {
	const notes = [buffer.offReason, buffer.saveError].filter(
		(note) => note !== undefined,
	);
	return notes.length === 0 ? { records } : { records, note: notes.join("; ") };
}

function levelOf(type) {
	if (type === "warning") return "warn";
	if (type === "error" || type === "assert") return "error";
	if (type === "debug" || type === "trace") return "debug";
	if (type === "info") return "info";
	return "log";
}

function textOf(arg) {
	if (arg?.value !== undefined) return String(arg.value);
	if (typeof arg?.description === "string") return arg.description;
	return String(arg?.type ?? "");
}

/** 按上限切请求体。说明占的字符也算在上限内，丢掉的数量与实际切掉的一致。 */
function clipBody(text) {
	if (text.length <= BODY_LIMIT) return text;
	let kept = BODY_LIMIT;
	let dropped = text.length - kept;
	// 说明里的数字位数会改变说明本身的长度，迭代到不再变为止。
	for (;;) {
		const next = BODY_LIMIT - bodyNote(dropped).length;
		const nextDropped = text.length - next;
		if (next === kept) break;
		kept = next;
		dropped = nextDropped;
	}
	return text.slice(0, kept) + bodyNote(dropped);
}

function bodyNote(dropped) {
	return `\n[truncated ${dropped} chars]`;
}

function messageOf(error) {
	return error instanceof Error ? error.message : String(error);
}
