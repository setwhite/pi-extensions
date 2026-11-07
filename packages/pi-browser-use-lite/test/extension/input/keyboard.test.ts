import { afterEach, expect, it } from "vitest";
import {
	type ChromeStub,
	extensionUrl,
	stubChrome,
	uninstallChrome,
} from "./chrome-stub.ts";

interface KeyEvent {
	type: string;
	key: string;
	code?: string;
	windowsVirtualKeyCode?: number;
	text?: string;
	modifiers?: number;
	commands?: string[];
}

interface KeyboardModule {
	press: (params: Record<string, unknown>) => Promise<unknown>;
	type: (params: Record<string, unknown>) => Promise<unknown>;
	fill: (params: Record<string, unknown>) => Promise<unknown>;
}

const { press, type, fill } = (await import(
	extensionUrl("input/keyboard.js")
)) as KeyboardModule;

/** 桩的 Runtime.evaluate 应答：可见、可编辑按用例开关、其余当元素中心。 */
function stubKeyboard(options: { editable?: boolean } = {}): ChromeStub {
	return stubChrome({
		evaluate: (expression) => {
			if (expression === "document.visibilityState") return "visible";
			if (expression.includes("isContentEditable"))
				return options.editable === true;
			return { x: 10, y: 20 };
		},
	});
}

function keyEvents(stub: ChromeStub): KeyEvent[] {
	return stub.calls
		.filter((call) => call.method === "Input.dispatchKeyEvent")
		.map((call) => call.params as unknown as KeyEvent);
}

function insertedTexts(stub: ChromeStub): string[] {
	return stub.calls
		.filter((call) => call.method === "Input.insertText")
		.map((call) => String(call.params.text));
}

afterEach(() => {
	uninstallChrome();
});

it("AC2: press 收到 Ctrl+A 解析成键 A 与 Ctrl 修饰位", async () => {
	const stub = stubKeyboard();

	const result = await press({ tabId: 101, key: "Ctrl+A" });

	const events = keyEvents(stub);
	expect(events).toHaveLength(1);
	expect(events[0]).toMatchObject({
		type: "rawKeyDown",
		key: "A",
		code: "KeyA",
		modifiers: 2,
	});
	expect(result).toEqual({ key: "A", modifiers: 2 });
});

it("AC3: 普通输入上 type 逐字符，每个字符一个事件", async () => {
	const stub = stubKeyboard({ editable: false });

	await type({ tabId: 102, text: "ab" });

	expect(keyEvents(stub).map((event) => [event.key, event.text])).toEqual([
		["a", "a"],
		["b", "b"],
	]);
	expect(insertedTexts(stub)).toHaveLength(0);
});

it("AC4: contenteditable 上 type 只发一次 Input.insertText", async () => {
	const stub = stubKeyboard({ editable: true });

	await type({ tabId: 103, text: "hello" });

	expect(insertedTexts(stub)).toEqual(["hello"]);
	expect(keyEvents(stub)).toHaveLength(0);
});

it("AC5: replace 先发全选与删除，然后才输入", async () => {
	const stub = stubKeyboard({ editable: false });

	await type({ tabId: 104, text: "x", replace: true });

	const events = keyEvents(stub);
	expect(events[0]).toMatchObject({
		key: "a",
		code: "KeyA",
		modifiers: 2,
		commands: ["selectAll"],
	});
	expect(events[1]).toMatchObject({ key: "Delete", code: "Delete" });
	expect(events[2]).toMatchObject({ key: "x", text: "x" });
});

it("交付物: press Enter 发回车键事件", async () => {
	const stub = stubKeyboard();

	const result = await press({ tabId: 105, key: "Enter" });

	expect(keyEvents(stub)[0]).toMatchObject({
		key: "Enter",
		code: "Enter",
		windowsVirtualKeyCode: 13,
		text: "\r",
		modifiers: 0,
	});
	expect(result).toEqual({ key: "Enter", modifiers: 0 });
});

it("交付物: fill 逐字段点击后整体替换", async () => {
	const stub = stubKeyboard({ editable: false });

	await fill({ tabId: 106, fields: [{ selector: "#name", value: "pi" }] });

	const events = keyEvents(stub);
	expect(events[0]).toMatchObject({ commands: ["selectAll"] });
	expect(events.slice(2).map((event) => event.key)).toEqual(["p", "i"]);
	const mouse = stub.calls
		.filter((call) => call.method === "Input.dispatchMouseEvent")
		.map((call) => call.params);
	expect(mouse).toHaveLength(3);
	expect(mouse[0]).toMatchObject({ x: 10, y: 20 });
});

it("bad_args: 缺 key 时抛错且不发 CDP", async () => {
	const stub = stubKeyboard();

	await expect(press({ tabId: 107 })).rejects.toThrow(
		"bad_args: key is required",
	);

	expect(stub.debugger.sendCommand).not.toHaveBeenCalled();
});

it("bad_args: fields 为空时抛错且不发 CDP", async () => {
	const stub = stubKeyboard();

	await expect(fill({ tabId: 108, fields: [] })).rejects.toThrow("bad_args");

	expect(stub.debugger.sendCommand).not.toHaveBeenCalled();
});

it("bad_args: 键位表外的键名抛错且不发 CDP", async () => {
	const stub = stubKeyboard();

	await expect(press({ tabId: 109, key: "F13" })).rejects.toThrow(
		"bad_args: unknown key: F13",
	);

	expect(stub.debugger.sendCommand).not.toHaveBeenCalled();
});

it("交付物: 键位表外的字符只靠 text 插入", async () => {
	const stub = stubKeyboard({ editable: false });

	await type({ tabId: 110, text: "中" });

	expect(keyEvents(stub)).toEqual([
		expect.objectContaining({ key: "中", text: "中" }),
	]);
});
