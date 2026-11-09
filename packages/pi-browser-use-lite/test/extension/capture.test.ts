import { afterEach, expect, it, vi } from "vitest";
import {
	type ChromeStub,
	extensionUrl,
	type StubOptions,
	stubChrome,
	uninstallChrome,
} from "./input/chrome-stub.ts";

interface CaptureModule {
	startCapture: (tabId: number) => Promise<void>;
	onCommitted: (details: { tabId: number; frameId: number }) => Promise<void>;
	listConsole: (
		tabId: number,
		options?: { clear?: boolean },
	) => Promise<{ records: Record<string, unknown>[]; note?: string }>;
	listNetwork: (
		tabId: number,
		options?: { clear?: boolean },
	) => Promise<{ records: Record<string, unknown>[]; note?: string }>;
	networkRequest: (
		tabId: number,
		requestId: string,
	) => Promise<Record<string, unknown>>;
}

/**
 * 每个用例都从干净的模块起：缓冲区与事件订阅都是模块级的，
 * 桩要先立好，模块加载时才订得上这个用例的 chrome.debugger。
 */
async function setup(
	tabId: number,
	options: StubOptions = {},
): Promise<{ stub: ChromeStub; capture: CaptureModule }> {
	const stub = stubChrome({
		...options,
		storage: { "target.tabId.s1": tabId, ...options.storage },
	});
	vi.resetModules();
	const capture = (await import(extensionUrl("capture.js"))) as CaptureModule;
	return { stub, capture };
}

afterEach(() => {
	uninstallChrome();
});

it("AC2: 导航一提交就挂上调试器并开两个域，随后的 console 被记到", async () => {
	const { stub, capture } = await setup(7);

	await capture.onCommitted({ tabId: 7, frameId: 0 });
	stub.emit({ tabId: 7 }, "Runtime.consoleAPICalled", {
		type: "log",
		args: [{ value: "hello" }, { value: 42 }],
		timestamp: 1_000,
	});

	const { records } = await capture.listConsole(7);

	expect(stub.methods).toEqual(["attach", "send", "send"]);
	expect(stub.calls.map((call) => call.method)).toEqual([
		"Runtime.enable",
		"Network.enable",
	]);
	expect(records).toEqual([{ level: "log", text: "hello 42", time: 1_000 }]);
});

it("非主框架的提交不管，非本会话的标签也不挂调试器", async () => {
	const { stub, capture } = await setup(7);

	await capture.onCommitted({ tabId: 7, frameId: 3 });
	await capture.onCommitted({ tabId: 99, frameId: 0 });

	expect(stub.methods).toEqual([]);
});

it("AC3: console 停在 500 条，丢最旧的", async () => {
	const { stub, capture } = await setup(7);
	await capture.startCapture(7);
	for (let i = 0; i < 501; i++)
		stub.emit({ tabId: 7 }, "Runtime.consoleAPICalled", {
			type: "log",
			args: [{ value: `line ${i}` }],
			timestamp: i,
		});

	const { records } = await capture.listConsole(7);

	expect(records).toHaveLength(500);
	expect(records[0]).toEqual({ level: "log", text: "line 1", time: 1 });
	expect(records.at(-1)).toEqual({ level: "log", text: "line 500", time: 500 });
});

it("console 的级别按宿主认的名字归一", async () => {
	const { stub, capture } = await setup(7);
	await capture.startCapture(7);
	for (const type of ["warning", "error", "info"])
		stub.emit({ tabId: 7 }, "Runtime.consoleAPICalled", {
			type,
			args: [{ value: type }],
			timestamp: 0,
		});

	const levels = (await capture.listConsole(7)).records.map(
		(record) => record.level,
	);

	expect(levels).toEqual(["warn", "error", "info"]);
});

it("AC4: network 记方法、URL、状态与耗时；请求体截断并注明", async () => {
	const { stub, capture } = await setup(7);
	await capture.startCapture(7);
	const body = "x".repeat(200_500);

	stub.emit({ tabId: 7 }, "Network.requestWillBeSent", {
		requestId: "r1",
		request: { method: "POST", url: "https://a/api", postData: body },
		timestamp: 10,
	});
	stub.emit({ tabId: 7 }, "Network.responseReceived", {
		requestId: "r1",
		response: { status: 201 },
		timestamp: 10.1,
	});
	stub.emit({ tabId: 7 }, "Network.loadingFinished", {
		requestId: "r1",
		timestamp: 10.25,
	});

	const [record] = (await capture.listNetwork(7)).records;
	const sent = String(record?.requestBody ?? "");

	expect(record).toMatchObject({
		id: "r1",
		method: "POST",
		url: "https://a/api",
		status: 201,
		durationMs: 250,
		requestBodyTruncated: true,
	});
	// 截断说明自身也算在 200,000 字符之内，丢掉的数量与实际切掉的一致。
	const note = sent.match(/\n\[truncated (\d+) chars\]$/);
	const kept = sent.length - (note?.[0].length ?? 0);

	expect(sent.length).toBe(200_000);
	expect(sent.slice(0, kept)).toBe("x".repeat(kept));
	expect(kept + Number(note?.[1])).toBe(200_500);
});

it("AC5: 同一标签再导航一次，上一次的请求还在", async () => {
	const { stub, capture } = await setup(7);
	await capture.startCapture(7);
	stub.emit({ tabId: 7 }, "Network.requestWillBeSent", {
		requestId: "r1",
		request: { method: "GET", url: "https://a/first" },
		timestamp: 1,
	});

	await capture.onCommitted({ tabId: 7, frameId: 0 });

	expect(
		(await capture.listNetwork(7)).records.map((record) => record.url),
	).toEqual(["https://a/first"]);
});

it("AC6: clear 只清掉点名的那一类", async () => {
	const { stub, capture } = await setup(7);
	await capture.startCapture(7);
	stub.emit({ tabId: 7 }, "Runtime.consoleAPICalled", {
		type: "log",
		args: [{ value: "kept" }],
		timestamp: 1,
	});
	stub.emit({ tabId: 7 }, "Network.requestWillBeSent", {
		requestId: "r1",
		request: { method: "GET", url: "https://a" },
		timestamp: 1,
	});

	const cleared = await capture.listConsole(7, { clear: true });

	expect(cleared.records).toHaveLength(1);
	expect((await capture.listConsole(7)).records).toHaveLength(0);
	expect((await capture.listNetwork(7)).records).toHaveLength(1);
});

it("AC7: request_id 取详情，未知 id 报 bad_args", async () => {
	const { stub, capture } = await setup(7, {
		send: (method) =>
			method === "Network.getResponseBody"
				? { body: '{"ok":true}', base64Encoded: false }
				: {},
	});
	await capture.startCapture(7);
	stub.emit({ tabId: 7 }, "Network.requestWillBeSent", {
		requestId: "r1",
		request: { method: "GET", url: "https://a" },
		timestamp: 1,
	});

	const detail = await capture.networkRequest(7, "r1");

	expect(detail).toMatchObject({ id: "r1", responseBody: '{"ok":true}' });
	await expect(capture.networkRequest(7, "nope")).rejects.toThrow(
		"bad_args: no request with id nope",
	);
});

it("AC8: 挂不上调试器时导航不受影响，logs 头部说明抓取关了", async () => {
	const { capture } = await setup(7, {
		attachError: new Error("Another debugger is already attached"),
	});

	await expect(
		capture.onCommitted({ tabId: 7, frameId: 0 }),
	).resolves.toBeUndefined();

	const result = await capture.listConsole(7);

	expect(result.records).toEqual([]);
	expect(result.note).toBe(
		"capture is off for this tab: cdp_unavailable: Another debugger is already attached",
	);
});

it("调试器被摘掉以后也算抓取关了", async () => {
	const { stub, capture } = await setup(7);
	await capture.startCapture(7);

	stub.emitDetach({ tabId: 7 }, "canceled_by_user");

	expect((await capture.listNetwork(7)).note).toBe(
		"capture is off for this tab: canceled_by_user",
	);
});

it("抓取开始前到的调试器事件也留下", async () => {
	const { stub, capture } = await setup(7);

	stub.emit({ tabId: 7 }, "Network.requestWillBeSent", {
		requestId: "r1",
		request: { method: "GET", url: "https://a/early" },
		timestamp: 10,
	});
	await capture.startCapture(7);
	stub.emit({ tabId: 7 }, "Network.loadingFinished", {
		requestId: "r1",
		timestamp: 10.25,
	});

	expect((await capture.listNetwork(7)).records).toEqual([
		expect.objectContaining({ id: "r1", durationMs: 250 }),
	]);
});

it("service worker 回收后缓冲区从存储里回来，耗时照算", async () => {
	const { stub, capture } = await setup(7);
	stub.emit({ tabId: 7 }, "Network.requestWillBeSent", {
		requestId: "r1",
		request: { method: "GET", url: "https://a/survives" },
		timestamp: 10,
	});
	await capture.listNetwork(7);

	vi.resetModules();
	const reloaded = (await import(extensionUrl("capture.js"))) as CaptureModule;
	stub.emit({ tabId: 7 }, "Network.loadingFinished", {
		requestId: "r1",
		timestamp: 10.25,
	});

	expect((await reloaded.listNetwork(7)).records).toEqual([
		expect.objectContaining({ url: "https://a/survives", durationMs: 250 }),
	]);
});

it("worker 回收后重新开域：capturing 不跨 worker", async () => {
	const { stub, capture } = await setup(7);
	await capture.startCapture(7);

	vi.resetModules();
	const reloaded = (await import(extensionUrl("capture.js"))) as CaptureModule;
	await reloaded.startCapture(7);

	const enables = stub.calls.filter((call) => call.method === "Runtime.enable");
	expect(enables).toHaveLength(2);
});

it("存储写不进时不抛，读的时候说明没在保存", async () => {
	const { stub, capture } = await setup(7, {
		storageError: new Error("QUOTA_BYTES quota exceeded"),
	});

	await expect(capture.startCapture(7)).resolves.toBeUndefined();
	stub.emit({ tabId: 7 }, "Runtime.consoleAPICalled", {
		type: "log",
		args: [{ value: "still here" }],
		timestamp: 1,
	});

	const result = await capture.listConsole(7);

	expect(result.records).toHaveLength(1);
	expect(result.note).toBe(
		"the log buffer is not being saved: QUOTA_BYTES quota exceeded",
	);
});

it("标签关掉后删掉它的缓冲区与存储键", async () => {
	const { stub, capture } = await setup(7);
	await capture.startCapture(7);
	stub.emit({ tabId: 7 }, "Network.requestWillBeSent", {
		requestId: "r1",
		request: { method: "GET", url: "https://a/gone" },
		timestamp: 1,
	});
	await capture.listNetwork(7);

	stub.emitTabRemoved(7);

	const readStored = stub.storage.session.get as unknown as (
		key: string,
	) => Promise<Record<string, unknown>>;
	expect(await readStored("capture.logs.7")).toEqual({});
	expect((await capture.listNetwork(7)).records).toEqual([]);
});

it("AC3: network 停在 1,000 条，丢最旧的", async () => {
	const { stub, capture } = await setup(7);
	await capture.startCapture(7);
	for (let i = 0; i < 1_001; i++)
		stub.emit({ tabId: 7 }, "Network.requestWillBeSent", {
			requestId: `r${i}`,
			request: { method: "GET", url: `https://a/${i}` },
			timestamp: i,
		});

	const { records } = await capture.listNetwork(7);

	expect(records).toHaveLength(1_000);
	expect(records[0]).toMatchObject({ id: "r1", url: "https://a/1" });
	expect(records.at(-1)).toMatchObject({ id: "r1000" });
});
