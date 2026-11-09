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
function stubKeyboard(
	options: { editable?: boolean; focus?: string } = {},
): ChromeStub {
	return stubChrome({
		evaluate: (expression) => {
			if (expression === "document.visibilityState") return "visible";
			if (expression.includes("activeElement"))
				return (
					options.focus ?? (options.editable === true ? "editable" : "field")
				);
			return { x: 10, y: 20 };
		},
	});
}

function keyEvents(stub: ChromeStub): KeyEvent[] {
	return stub.calls
		.filter((call) => call.method === "Input.dispatchKeyEvent")
		.map((call) => call.params as unknown as KeyEvent);
}

function keyDowns(stub: ChromeStub): KeyEvent[] {
	return keyEvents(stub).filter((event) => event.type !== "keyUp");
}

function keyUps(stub: ChromeStub): KeyEvent[] {
	return keyEvents(stub).filter((event) => event.type === "keyUp");
}

function insertedTexts(stub: ChromeStub): string[] {
	return stub.calls
		.filter((call) => call.method === "Input.insertText")
		.map((call) => String(call.params.text));
}

afterEach(() => {
	uninstallChrome();
});

it("AC2: press 收到 Ctrl+A 先按 Control，再按 A，最后逆序松开", async () => {
	const stub = stubKeyboard();

	const result = await press({ tabId: 101, key: "Ctrl+A" });

	const events = keyEvents(stub);
	expect(events.map((event) => [event.type, event.key])).toEqual([
		["keyDown", "Control"],
		["rawKeyDown", "A"],
		["keyUp", "A"],
		["keyUp", "Control"],
	]);
	expect(events[0]).toMatchObject({
		key: "Control",
		code: "ControlLeft",
		windowsVirtualKeyCode: 17,
		modifiers: 2,
	});
	expect(events[1]).toMatchObject({
		type: "rawKeyDown",
		key: "A",
		code: "KeyA",
		modifiers: 2,
	});
	expect(events[3]).toEqual({
		type: "keyUp",
		key: "Control",
		code: "ControlLeft",
		windowsVirtualKeyCode: 17,
		modifiers: 0,
	});
	expect(result).toEqual({ key: "A", modifiers: 2 });
});

it("多个修饰键按 Meta、Ctrl、Alt、Shift 顺序按下，松开时保留仍按住的位", async () => {
	const stub = stubKeyboard();

	await press({ tabId: 113, key: "Ctrl+Shift+Tab" });

	expect(keyDowns(stub).map((event) => event.key)).toEqual([
		"Control",
		"Shift",
		"Tab",
	]);
	expect(keyUps(stub).map((event) => [event.key, event.modifiers])).toEqual([
		["Tab", 10],
		["Shift", 2],
		["Control", 0],
	]);
});

it("Shift+Tab 按下 Shift 本身，主键仍带 text", async () => {
	const stub = stubKeyboard();

	await press({ tabId: 111, key: "Shift+Tab" });

	const downs = keyDowns(stub);
	expect(downs.map((event) => event.key)).toEqual(["Shift", "Tab"]);
	expect(downs[0]).toMatchObject({ modifiers: 8 });
	expect(downs[1]).toMatchObject({ type: "keyDown", text: "\t", modifiers: 8 });
	expect(keyUps(stub).map((event) => [event.key, event.modifiers])).toEqual([
		["Tab", 8],
		["Shift", 0],
	]);
});

it("AC3: 普通输入上 type 先移到末尾，再逐字符发事件", async () => {
	const stub = stubKeyboard({ editable: false });

	await type({ tabId: 102, text: "ab" });

	const downs = keyDowns(stub);
	expect(downs[0]).toMatchObject({
		type: "rawKeyDown",
		key: "End",
		code: "End",
		commands: ["moveToEndOfDocument"],
	});
	expect(downs.slice(1).map((event) => [event.key, event.text])).toEqual([
		["a", "a"],
		["b", "b"],
	]);
	// End 也松开，每个字符各一对。
	expect(keyUps(stub).map((event) => event.key)).toEqual(["End", "a", "b"]);
	expect(insertedTexts(stub)).toHaveLength(0);
});

it("type 的焦点不在可编辑元素上时不挪光标，按键照发", async () => {
	const stub = stubKeyboard({ focus: "none" });

	await type({ tabId: 112, text: "x" });

	expect(keyDowns(stub).map((event) => event.commands)).toEqual([undefined]);
	expect(keyUps(stub).map((event) => event.key)).toEqual(["x"]);
});

it("AC4: contenteditable 上 type 只发一次 Input.insertText", async () => {
	const stub = stubKeyboard({ editable: true });

	await type({ tabId: 103, text: "hello" });

	expect(insertedTexts(stub)).toEqual(["hello"]);
	expect(keyDowns(stub).map((event) => event.commands)).toEqual([
		["moveToEndOfDocument"],
	]);
	expect(keyUps(stub).map((event) => event.key)).toEqual(["End"]);
});

it("AC5: replace 先发全选与删除，然后才输入", async () => {
	const stub = stubKeyboard({ editable: false });

	await type({ tabId: 104, text: "x", replace: true });

	const downs = keyDowns(stub);
	expect(downs[0]).toMatchObject({ key: "Control", modifiers: 2 });
	expect(downs[1]).toMatchObject({
		key: "a",
		code: "KeyA",
		modifiers: 2,
		commands: ["selectAll"],
	});
	expect(downs[2]).toMatchObject({ key: "Delete", code: "Delete" });
	expect(downs[3]).toMatchObject({ key: "x", text: "x" });
	// replace 已经清空，不需要再移到末尾。
	expect(
		downs.some((event) => event.commands?.[0] === "moveToEndOfDocument"),
	).toBe(false);
	// 全选（A 与 Control 依次松开）、删除、输入，每个键都松开。
	expect(keyUps(stub).map((event) => event.key)).toEqual([
		"a",
		"Control",
		"Delete",
		"x",
	]);
});

it("交付物: press Enter 发一对 keyDown/keyUp", async () => {
	const stub = stubKeyboard();

	const result = await press({ tabId: 105, key: "Enter" });

	expect(keyDowns(stub)[0]).toMatchObject({
		key: "Enter",
		code: "Enter",
		windowsVirtualKeyCode: 13,
		text: "\r",
		modifiers: 0,
	});
	expect(keyUps(stub)[0]).toEqual({
		type: "keyUp",
		key: "Enter",
		code: "Enter",
		windowsVirtualKeyCode: 13,
		modifiers: 0,
	});
	expect(result).toEqual({ key: "Enter", modifiers: 0 });
});

it("交付物: fill 逐字段点击后整体替换", async () => {
	const stub = stubKeyboard({ editable: false });

	await fill({ tabId: 106, fields: [{ selector: "#name", value: "pi" }] });

	const downs = keyDowns(stub);
	expect(downs[1]).toMatchObject({ commands: ["selectAll"] });
	expect(downs.slice(3).map((event) => event.key)).toEqual(["p", "i"]);
	const mouse = stub.calls
		.filter((call) => call.method === "Input.dispatchMouseEvent")
		.map((call) => call.params);
	expect(mouse).toHaveLength(3);
	expect(mouse[0]).toMatchObject({ x: 10, y: 20 });
});

it("fill 收 ref 解析出的坐标，点在该点上", async () => {
	const stub = stubKeyboard({ editable: false });

	await fill({
		tabId: 114,
		fields: [{ x: 42, y: 84, value: "pi" }],
	});

	const mouse = stub.calls
		.filter((call) => call.method === "Input.dispatchMouseEvent")
		.map((call) => call.params);
	expect(mouse[0]).toMatchObject({ x: 42, y: 84 });
});

it("fill 在每次点击前才解析 ref，定位不会提前失效", async () => {
	const stub = stubKeyboard({ editable: false });
	const order: string[] = [];

	await fill({
		tabId: 115,
		fields: [
			{
				ref: "e1",
				value: "a",
				locate: async () => {
					order.push("locate e1");
					return { x: 5, y: 6 };
				},
			},
			{
				ref: "e2",
				value: "b",
				locate: async () => {
					order.push("locate e2");
					return { x: 7, y: 8 };
				},
			},
		],
	});

	const pressed = stub.calls
		.filter(
			(call) =>
				call.method === "Input.dispatchMouseEvent" &&
				call.params.type === "mousePressed",
		)
		.map((call) => [call.params.x, call.params.y]);

	expect(order).toEqual(["locate e1", "locate e2"]);
	expect(pressed).toEqual([
		[5, 6],
		[7, 8],
	]);
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

	const chars = keyDowns(stub).filter((event) => event.commands === undefined);
	expect(chars).toEqual([expect.objectContaining({ key: "中", text: "中" })]);
});
