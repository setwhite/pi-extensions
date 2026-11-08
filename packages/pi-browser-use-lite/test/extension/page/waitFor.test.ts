import { afterEach, beforeEach, expect, it, vi } from "vitest";

/** vi.mock 会被提到 import 之前，所以这里自己算 URL，不能引用导入的绑定。 */
function extensionUrl(path: string): string {
	return new URL(
		`../../../browser-extension/background/${path}`,
		import.meta.url,
	).href;
}

vi.mock(extensionUrl("input/debugger.js"), () => ({ evaluate: vi.fn() }));

const { evaluate } = (await import(extensionUrl("input/debugger.js"))) as {
	evaluate: ReturnType<typeof vi.fn>;
};
const { waitFor } = (await import(extensionUrl("page/waitFor.js"))) as {
	waitFor: (params: {
		tabId?: number;
		kind?: string;
		value?: string;
		timeoutMs?: number;
	}) => Promise<{ waitedMs: number }>;
};

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
	vi.clearAllMocks();
});

/** 让轮询跑完：把时间推到给定毫秒，中途的 setTimeout 都会兑现。 */
async function run<T>(promise: Promise<T>, ms: number): Promise<T> {
	const settled = promise.then(
		(value) => ({ value }),
		(error: unknown) => ({ error }),
	);
	await vi.advanceTimersByTimeAsync(ms);
	const outcome = await settled;
	if ("error" in outcome) throw outcome.error;
	return outcome.value;
}

it("AC2: selector 等 querySelector 命中", async () => {
	evaluate.mockResolvedValueOnce(true);

	const result = await run(
		waitFor({ tabId: 7, kind: "selector", value: "#go" }),
		0,
	);

	expect(evaluate).toHaveBeenCalledWith(7, '!!document.querySelector("#go")');
	expect(result).toEqual({ waitedMs: 0 });
});

it("AC2: expression 等表达式为真", async () => {
	evaluate.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

	const result = await run(
		waitFor({ tabId: 7, kind: "expression", value: "window.ready" }),
		250,
	);

	expect(evaluate.mock.calls[0]?.[1]).toBe("!!(window.ready)");
	expect(evaluate).toHaveBeenCalledTimes(2);
	expect(result).toEqual({ waitedMs: 250 });
});

it("AC2: text 等正文含 value", async () => {
	evaluate.mockResolvedValueOnce(true);

	await run(waitFor({ tabId: 7, kind: "text", value: "Done" }), 0);

	expect(evaluate.mock.calls[0]?.[1]).toBe(
		'document.body !== null && document.body.innerText.includes("Done")',
	);
});

it("AC5: 间隔写死 250 毫秒，命中在第 4 次探测", async () => {
	evaluate
		.mockResolvedValueOnce(false)
		.mockResolvedValueOnce(false)
		.mockResolvedValueOnce(false)
		.mockResolvedValueOnce(true);

	const result = await run(
		waitFor({ tabId: 7, kind: "selector", value: "#go", timeoutMs: 1_000 }),
		750,
	);

	expect(evaluate).toHaveBeenCalledTimes(4);
	expect(result).toEqual({ waitedMs: 750 });
});

it("AC3: 超时抛 timeout，带 kind、value 与时限", async () => {
	evaluate.mockResolvedValue(false);

	await expect(
		run(
			waitFor({ tabId: 7, kind: "selector", value: "#go", timeoutMs: 1_000 }),
			1_000,
		),
	).rejects.toThrow("timeout: waiting for selector #go timed out after 1000ms");
	expect(evaluate).toHaveBeenCalledTimes(5);
});

it("AC3: 不给时限按 15 秒算", async () => {
	evaluate.mockResolvedValue(false);

	await expect(
		run(waitFor({ tabId: 7, kind: "text", value: "Done" }), 15_000),
	).rejects.toThrow("timed out after 15000ms");
});

it("AC7: 页面求值报错原样上抛，不当成还没命中重试", async () => {
	evaluate.mockRejectedValueOnce(
		new Error("page_error: ReferenceError: nope is not defined"),
	);

	await expect(
		waitFor({ tabId: 7, kind: "expression", value: "nope.ready" }),
	).rejects.toThrow("page_error: ReferenceError: nope is not defined");
	expect(evaluate).toHaveBeenCalledTimes(1);
});

it("kind 与 value 不合法时报 bad_args", async () => {
	await expect(
		waitFor({ tabId: 7, kind: "css", value: "#go" }),
	).rejects.toThrow(
		"bad_args: kind must be selector, expression or text, got css",
	);
	await expect(waitFor({ tabId: 7, kind: "text" })).rejects.toThrow(
		"bad_args: value must be a non-empty string",
	);
	expect(evaluate).not.toHaveBeenCalled();
});
