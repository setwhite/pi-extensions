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

/** tabId → { console, network, starts, capturing, offReason } */
const buffers = new Map();
/** 正在从存储里读的缓冲区。两个调用同时到时共用同一次读，不各建一份。 */
const pending = new Map();
let subscribed = false;

subscribe();

/** 事件监听在模块加载时注册，service worker 才会被它们唤醒。 */
function subscribe() {
	const debuggerApi = globalThis.chrome?.debugger;
	if (subscribed || debuggerApi === undefined) return;
	subscribed = true;
	debuggerApi.onEvent.addListener(onEvent);
	debuggerApi.onDetach.addListener(onDetach);
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
	return withNote(records, buffer.offReason);
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
	return withNote(records, buffer.offReason);
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
	await save(tabId, buffer);
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
				capturing: saved.capturing === true,
				offReason: saved.offReason,
			};
		});
		pending.set(tabId, loading);
	}
	const buffer = await loading;
	buffers.set(tabId, buffer);
	pending.delete(tabId);
	return buffer;
}

async function save(tabId, buffer) {
	await chrome.storage.session.set({
		[KEY_PREFIX + tabId]: {
			console: buffer.console,
			network: buffer.network,
			starts: Object.fromEntries(buffer.starts),
			capturing: buffer.capturing,
			offReason: buffer.offReason,
		},
	});
}

function withNote(records, offReason) {
	return offReason === undefined ? { records } : { records, note: offReason };
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
