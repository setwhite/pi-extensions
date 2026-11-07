import { afterEach, expect, it } from "vitest";
import {
	extensionUrl,
	stubChrome,
	uninstallChrome,
} from "../input/chrome-stub.ts";

interface EvaluateModule {
	evaluatePage: (params: { tabId: number; js?: unknown }) => Promise<{
		value: unknown;
		note?: string;
	}>;
}

const { evaluatePage } = (await import(
	extensionUrl("page/evaluate.js")
)) as EvaluateModule;

/** 求值表达式带上辅助函数调用，桩据此区分求值与其它 Runtime.evaluate。 */
function isEvaluation(expression: string): boolean {
	return expression.includes("__piHelpers.stringify");
}

afterEach(() => {
	uninstallChrome();
});

it("AC2: 求值调 Runtime.evaluate，辅助函数以 MAIN world 注入", async () => {
	const stub = stubChrome({
		evaluate: (expression) =>
			isEvaluation(expression) ? { title: "t" } : undefined,
	});

	const result = await evaluatePage({ tabId: 201, js: "document.title" });

	expect(result).toEqual({ value: { title: "t" } });
	expect(stub.scripting.executeScript).toHaveBeenCalledWith(
		expect.objectContaining({ world: "MAIN" }),
	);
	expect(
		stub.calls.filter((call) => call.method === "Runtime.evaluate"),
	).toHaveLength(1);
});

it("AC3: chrome.scripting 被权限拒绝时改走 CDP，不抛错", async () => {
	const stub = stubChrome({
		scriptingError: new Error('Cannot access contents of url "https://x/".'),
		evaluate: (expression) => (isEvaluation(expression) ? 42 : "installed"),
	});

	const result = await evaluatePage({ tabId: 202, js: "6*7" });

	expect(result).toEqual({ value: 42 });
	const evaluations = stub.calls.filter(
		(call) => call.method === "Runtime.evaluate",
	);
	expect(evaluations).toHaveLength(2);
	expect(String(evaluations[0]?.params.expression)).toContain(
		"globalThis.__piHelpers =",
	);
});

it("AC4: data 超 100 字符时省略并给 note", async () => {
	const long = "x".repeat(200);
	stubChrome({
		evaluate: (expression) =>
			isEvaluation(expression) ? { data: long, title: "t" } : undefined,
	});

	const result = await evaluatePage({
		tabId: 203,
		js: "({ data: 'x', title: 't' })",
	});

	expect(result.value).toEqual({ title: "t" });
	expect(result.note).toBe(
		"data omitted (200 chars); use chrome_vision to look at images",
	);
});

it("AC4: data 不超过 100 字符时保留，也不给 note", async () => {
	stubChrome({
		evaluate: (expression) =>
			isEvaluation(expression) ? { data: "y".repeat(100) } : undefined,
	});

	const result = await evaluatePage({ tabId: 204, js: "({ data: 'y' })" });

	expect(result.value).toEqual({ data: "y".repeat(100) });
	expect(result.note).toBeUndefined();
});

it("交付物: js 不是非空字符串时抛 bad_args 且不注入", async () => {
	const stub = stubChrome();

	await expect(evaluatePage({ tabId: 205, js: 5 })).rejects.toThrow(
		"bad_args: js must be a non-empty string",
	);
	await expect(evaluatePage({ tabId: 205, js: "   " })).rejects.toThrow(
		"bad_args: js must be a non-empty string",
	);

	expect(stub.scripting.executeScript).not.toHaveBeenCalled();
	expect(stub.calls).toHaveLength(0);
});

it("交付物: 表达式形式报 SyntaxError 时改按语句体求值", async () => {
	const stub = stubChrome({
		sendResults: [
			{
				exceptionDetails: {
					text: "Uncaught",
					exception: {
						description:
							"SyntaxError: Unexpected token 'var'\n    at <anonymous>:1:1",
					},
				},
			},
			{ result: { value: 7 } },
		],
	});

	const result = await evaluatePage({
		tabId: 206,
		js: "var a = 3; return a + 4",
	});

	expect(result).toEqual({ value: 7 });
	expect(
		stub.calls.filter((call) => call.method === "Runtime.evaluate"),
	).toHaveLength(2);
});

it("交付物: 页面里的 undefined、Error、矩形按标记解包", async () => {
	stubChrome({
		evaluate: (expression) =>
			isEvaluation(expression) ? { kind: "undefined" } : undefined,
	});
	await expect(evaluatePage({ tabId: 207, js: "undefined" })).resolves.toEqual({
		value: undefined,
	});

	stubChrome({
		evaluate: (expression) =>
			isEvaluation(expression)
				? { kind: "rect", x: 1, y: 2, width: 3, height: 4 }
				: undefined,
	});
	await expect(
		evaluatePage({ tabId: 208, js: "document.body.getBoundingClientRect()" }),
	).resolves.toEqual({ value: { x: 1, y: 2, width: 3, height: 4 } });

	stubChrome({
		evaluate: (expression) =>
			isEvaluation(expression)
				? { kind: "error", name: "TypeError", message: "boom" }
				: undefined,
	});
	await expect(evaluatePage({ tabId: 209, js: "null.x" })).rejects.toThrow(
		"page_error: TypeError: boom",
	);
});

it("交付物: 页面异常取原始消息首行", async () => {
	stubChrome({
		sendResults: [
			{
				exceptionDetails: {
					text: "Uncaught",
					exception: {
						description: "TypeError: boom\n    at <anonymous>:1:1",
					},
				},
			},
		],
	});

	await expect(evaluatePage({ tabId: 210, js: "null.x" })).rejects.toThrow(
		"page_error: TypeError: boom",
	);
});
