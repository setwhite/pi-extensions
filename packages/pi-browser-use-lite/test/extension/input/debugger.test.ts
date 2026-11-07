import { afterEach, expect, it } from "vitest";
import { extensionUrl, stubChrome, uninstallChrome } from "./chrome-stub.ts";

interface DebuggerModule {
	attach: (tabId: number) => Promise<void>;
	sendCommand: (
		tabId: number,
		method: string,
		params?: Record<string, unknown>,
	) => Promise<unknown>;
	executeScriptWithFallback: (options: {
		tabId: number;
		func: (...args: unknown[]) => unknown;
		args?: unknown[];
		world?: string;
	}) => Promise<unknown>;
}

const { sendCommand, executeScriptWithFallback } = (await import(
	extensionUrl("input/debugger.js")
)) as DebuggerModule;

afterEach(() => {
	uninstallChrome();
});

it("AC3: Detached 时先 detach 残留条目，再重挂并重试一次", async () => {
	const stub = stubChrome({
		sendResults: [new Error("Detached"), "retried"],
		detachResults: [
			new Error("Debugger is not attached to the tab with id: 12."),
		],
	});

	const result = await sendCommand(12, "Runtime.evaluate", {
		expression: "1",
	});

	expect(result).toBe("retried");
	expect(stub.methods).toEqual(["attach", "send", "detach", "attach", "send"]);
	expect(stub.debugger?.sendCommand).toHaveBeenCalledTimes(2);
});

it("AC3: 重试再失败就上抛，不重试第三次", async () => {
	const stub = stubChrome({
		sendResults: [new Error("Detached"), new Error("Detached")],
	});

	await expect(
		sendCommand(13, "Runtime.evaluate", { expression: "1" }),
	).rejects.toThrow("Detached");

	expect(stub.debugger?.sendCommand).toHaveBeenCalledTimes(2);
});

it("AC3: detach 的其它错误上抛，不重挂", async () => {
	const stub = stubChrome({
		sendResults: [new Error("Detached")],
		detachResults: [new Error("Cannot detach from this tab")],
	});

	await expect(
		sendCommand(14, "Runtime.evaluate", { expression: "1" }),
	).rejects.toThrow("Cannot detach from this tab");

	expect(stub.debugger?.attach).toHaveBeenCalledTimes(1);
});

it("AC2: 同一标签连续两次 CDP 调用只 attach 一次", async () => {
	const stub = stubChrome();

	await sendCommand(11, "Runtime.evaluate", { expression: "1" });
	await sendCommand(11, "Runtime.evaluate", { expression: "2" });

	expect(stub.debugger?.attach).toHaveBeenCalledTimes(1);
	expect(stub.debugger?.attach).toHaveBeenCalledWith({ tabId: 11 }, "1.3");
	expect(stub.debugger?.sendCommand).toHaveBeenCalledTimes(2);
});

it("AC4: chrome.debugger 不可用时抛错，且不激活标签", async () => {
	const stub = stubChrome({ withDebugger: false });

	await expect(
		sendCommand(21, "Runtime.evaluate", { expression: "1" }),
	).rejects.toThrow("chrome.debugger");

	expect(stub.tabs.update).not.toHaveBeenCalled();
});

it("AC5: executeScript 报 Cannot access contents of url 时改走 CDP", async () => {
	const stub = stubChrome({
		sendResults: [{ result: { type: "number", value: 3 } }],
	});
	stub.scripting.executeScript.mockRejectedValueOnce(
		new Error('Cannot access contents of url "chrome://extensions/"'),
	);

	const result = await executeScriptWithFallback({
		tabId: 31,
		func: (a: unknown, b: unknown) => Number(a) + Number(b),
		args: [1, 2],
	});

	expect(result).toEqual([{ result: 3 }]);
	expect(stub.debugger?.sendCommand).toHaveBeenCalledWith(
		{ tabId: 31 },
		"Runtime.evaluate",
		{
			expression: "((a, b) => Number(a) + Number(b))(...[1,2])",
			returnByValue: true,
			awaitPromise: true,
		},
	);
});

it("AC5: 其它 executeScript 错误原样上抛，不走 CDP", async () => {
	const stub = stubChrome();
	stub.scripting.executeScript.mockRejectedValueOnce(
		new Error("No tab with id: 32"),
	);

	await expect(
		executeScriptWithFallback({ tabId: 32, func: () => 1 }),
	).rejects.toThrow("No tab with id: 32");

	expect(stub.debugger?.sendCommand).not.toHaveBeenCalled();
});

it("AC5: scripting 成功时原样返回，不碰调试器", async () => {
	const stub = stubChrome();
	stub.scripting.executeScript.mockResolvedValueOnce([{ result: 7 }]);

	const result = await executeScriptWithFallback({ tabId: 33, func: () => 7 });

	expect(result).toEqual([{ result: 7 }]);
	expect(stub.debugger?.attach).not.toHaveBeenCalled();
});

it("AC3: 会话被外部收回报 Debugger is not attached 时也自愈", async () => {
	const stub = stubChrome({
		sendResults: [
			new Error("Debugger is not attached to the tab with id: 15."),
			"retried",
		],
	});

	const result = await sendCommand(15, "Runtime.evaluate", {
		expression: "1",
	});

	expect(result).toBe("retried");
	expect(stub.methods).toEqual(["attach", "send", "detach", "attach", "send"]);
});

it("AC5: 其它权限拒绝文案也走 CDP", async () => {
	const messages = [
		"Cannot access a chrome-extension:// URL of different extension at origin 42",
		"Extension manifest must request permission to access this host.",
		"matchAboutBlank must be true for about:blank pages",
	];

	for (const [index, message] of messages.entries()) {
		const stub = stubChrome({
			sendResults: [{ result: { value: index } }],
		});
		stub.scripting.executeScript.mockRejectedValueOnce(new Error(message));

		const result = await executeScriptWithFallback({
			tabId: 40 + index,
			func: () => index,
		});

		expect(result).toEqual([{ result: index }]);
	}
});

it("AC5: args 不能 JSON 序列化时抛明确错误", async () => {
	const stub = stubChrome();
	stub.scripting.executeScript.mockRejectedValueOnce(
		new Error('Cannot access contents of url "chrome://extensions/"'),
	);
	const circular: Record<string, unknown> = {};
	circular.self = circular;

	await expect(
		executeScriptWithFallback({
			tabId: 44,
			func: () => 1,
			args: [circular],
		}),
	).rejects.toThrow("args must be JSON-serializable");
});
