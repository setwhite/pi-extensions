import { afterEach, expect, it } from "vitest";
import { DEFAULTS } from "../../../src/config/index.ts";
import {
	type ChromeStub,
	extensionUrl,
	stubChrome,
	uninstallChrome,
} from "./chrome-stub.ts";

interface MouseEvent {
	type: string;
	x: number;
	y: number;
	button?: string;
	buttons?: number;
	deltaY?: number;
}

interface PointerModule {
	click: (target: Record<string, unknown>) => Promise<{ x: number; y: number }>;
	hover: (target: Record<string, unknown>) => Promise<{ x: number; y: number }>;
	drag: (target: Record<string, unknown>) => Promise<unknown>;
	scroll: (target: Record<string, unknown>) => Promise<unknown>;
}

const { click, hover, drag, scroll } = (await import(
	extensionUrl("input/pointer.js")
)) as PointerModule;

const RECT = { left: 8, top: 16, width: 4, height: 8, x: 10, y: 20 };

/** 桩的 Runtime.evaluate 应答：可见性（可给序列）、元素中心、视口中心。 */
function stubPointer(
	options: {
		visibility?: string | string[];
		element?: boolean;
		windowState?: string;
		tabActive?: boolean;
	} = {},
): ChromeStub {
	const states = Array.isArray(options.visibility)
		? [...options.visibility]
		: [options.visibility ?? "visible"];
	const nextState = (): string | undefined =>
		states.length > 1 ? states.shift() : states[0];
	const element = options.element ?? true;
	return stubChrome({
		windowState: options.windowState,
		tabActive: options.tabActive,
		evaluate: (expression) => {
			if (expression === "document.visibilityState") {
				const state = nextState();
				return state === "unreadable" ? undefined : state;
			}
			if (expression.includes("querySelector"))
				return element ? { x: RECT.x, y: RECT.y } : null;
			return { x: 400, y: 300 };
		},
	});
}

function mouseEvents(stub: ChromeStub): MouseEvent[] {
	return stub.calls
		.filter((call) => call.method === "Input.dispatchMouseEvent")
		.map((call) => call.params as unknown as MouseEvent);
}

afterEach(() => {
	uninstallChrome();
});

it("AC7: 一个定位都没给时抛 bad_args 且不发 CDP", async () => {
	const stub = stubPointer();

	await expect(click({ tabId: 101 })).rejects.toThrow("bad_args");

	expect(stub.debugger.sendCommand).not.toHaveBeenCalled();
});

it("AC7: 同时给 selector 与坐标时抛 bad_args 且不发 CDP", async () => {
	const stub = stubPointer();

	await expect(
		click({ tabId: 102, selector: "#a", x: 1, y: 2 }),
	).rejects.toThrow("bad_args");

	expect(stub.debugger.sendCommand).not.toHaveBeenCalled();
});

it("AC7: 只给 ref 时抛 bad_args，ref 由快照解析", async () => {
	const stub = stubPointer();

	await expect(click({ tabId: 103, ref: "e3" })).rejects.toThrow("bad_args");

	expect(stub.debugger.sendCommand).not.toHaveBeenCalled();
});

it("AC2/AC3: 按 selector 点击落在元素矩形内，事件序为 moved、pressed、released", async () => {
	const stub = stubPointer();

	await click({ tabId: 201, selector: "#submit" });

	const events = mouseEvents(stub);
	expect(events.map((event) => event.type)).toEqual([
		"mouseMoved",
		"mousePressed",
		"mouseReleased",
	]);
	const [moved, pressed, released] = events;
	expect(moved.x).toBeGreaterThanOrEqual(RECT.left);
	expect(moved.x).toBeLessThanOrEqual(RECT.left + RECT.width);
	expect(moved.y).toBeGreaterThanOrEqual(RECT.top);
	expect(moved.y).toBeLessThanOrEqual(RECT.top + RECT.height);
	expect(pressed.x).toBe(moved.x);
	expect(released.y).toBe(moved.y);
	expect(pressed.buttons).toBe(1);
	expect(released.buttons).toBe(0);
});

it("AC2: 按 selector 定位时先滚到视口中心再读 rect", async () => {
	const stub = stubPointer();

	await click({ tabId: 206, selector: "#submit" });

	const probe = stub.calls.find((call) =>
		String(call.params.expression).includes("querySelector"),
	);
	expect(String(probe?.params.expression)).toContain("scrollIntoView");
});

it("AC2: 按坐标点击直接使用给定坐标", async () => {
	const stub = stubPointer();

	await click({ tabId: 202, x: 15, y: 25 });

	const events = mouseEvents(stub);
	expect(events.map((event) => event.type)).toEqual([
		"mouseMoved",
		"mousePressed",
		"mouseReleased",
	]);
	expect(events.map((event) => [event.x, event.y])).toEqual([
		[15, 25],
		[15, 25],
		[15, 25],
	]);
});

it("AC4: 目标标签不可见时先激活标签与窗口，变可见后照常点击", async () => {
	const stub = stubPointer({ visibility: ["hidden", "visible"] });

	const point = await click({ tabId: 203, selector: "#a" });

	expect(stub.tabs.update).toHaveBeenCalledWith(203, { active: true });
	expect(stub.windows.update).toHaveBeenCalledWith(1, { focused: true });
	expect(mouseEvents(stub).length).toBeGreaterThan(0);
	expect(point).toEqual({ x: RECT.x, y: RECT.y });
});

it("AC4: 激活后仍不可见时抛错并说原因，不发鼠标事件", async () => {
	const stub = stubPointer({
		visibility: "hidden",
		tabActive: true,
		windowState: "minimized",
	});

	await expect(click({ tabId: 204, selector: "#a" })).rejects.toThrow(
		"is hidden because its window is minimized",
	);

	expect(mouseEvents(stub)).toHaveLength(0);
	expect(stub.tabs.update).toHaveBeenCalledTimes(1);
});

it("AC4: 标签不是活动标签时，报错说明是这一点", async () => {
	const stub = stubPointer({ visibility: "hidden" });

	await expect(click({ tabId: 205, selector: "#a" })).rejects.toThrow(
		"is hidden because it is an inactive tab",
	);

	expect(mouseEvents(stub)).toHaveLength(0);
});

it("AC5: dragSteps 为 3 时先移到起点，再发 3 次中间 mouseMoved", async () => {
	const stub = stubPointer();

	await drag({
		tabId: 301,
		from: { x: 10, y: 10 },
		to: { x: 40, y: 40 },
		steps: 3,
	});

	const events = mouseEvents(stub);
	// 按下前先经过起点，靠 :hover 出现的把手才会出现。
	expect(events[0]).toMatchObject({
		type: "mouseMoved",
		x: 10,
		y: 10,
		buttons: 0,
	});
	expect(events[1].type).toBe("mousePressed");
	expect(events.at(-1)?.type).toBe("mouseReleased");
	const moves = events.filter(
		(event) => event.type === "mouseMoved" && event.buttons === 1,
	);
	expect(moves).toHaveLength(3);
	expect(moves.every((event) => event.button === "left")).toBe(true);
	expect(moves.every((event) => event.buttons === 1)).toBe(true);
	expect(moves.at(-1)).toMatchObject({ x: 40, y: 40 });
});

it("AC5: 默认配置 10 步时 drag 发出 10 次中间 mouseMoved", async () => {
	const stub = stubPointer();

	await drag({
		tabId: 302,
		from: { x: 0, y: 0 },
		to: { x: 100, y: 50 },
		steps: DEFAULTS.input.dragSteps,
	});

	const moves = mouseEvents(stub).filter(
		(event) => event.type === "mouseMoved" && event.buttons === 1,
	);
	expect(moves).toHaveLength(10);
});

it("AC6: scrollSteps 为 2 时发出恰好 2 个 mouseWheel 事件", async () => {
	const stub = stubPointer();

	await scroll({ tabId: 401, dx: 0, dy: 300, steps: 2 });

	const wheels = mouseEvents(stub).filter(
		(event) => event.type === "mouseWheel",
	);
	expect(wheels).toHaveLength(2);
	expect(wheels.reduce((sum, event) => sum + (event.deltaY ?? 0), 0)).toBe(300);
	expect(wheels.every((event) => event.x === 400 && event.y === 300)).toBe(
		true,
	);
});

it("AC6: 默认配置 5 步时 scroll 发出 5 个 mouseWheel 事件", async () => {
	const stub = stubPointer();

	await scroll({
		tabId: 402,
		dx: 0,
		dy: 100,
		steps: DEFAULTS.input.scrollSteps,
	});

	const wheels = mouseEvents(stub).filter(
		(event) => event.type === "mouseWheel",
	);
	expect(wheels).toHaveLength(5);
});

it("交付物: hover 只发一次 mouseMoved，落在元素中心", async () => {
	const stub = stubPointer();

	const point = await hover({ tabId: 501, selector: "#menu" });

	expect(mouseEvents(stub).map((event) => event.type)).toEqual(["mouseMoved"]);
	expect(point).toEqual({ x: RECT.x, y: RECT.y });
});

it("质量: 可见性读不到时抛 page_error，不当作可见", async () => {
	const stub = stubPointer({ visibility: "unreadable" });

	await expect(click({ tabId: 602, x: 1, y: 2 })).rejects.toThrow("page_error");

	expect(mouseEvents(stub)).toHaveLength(0);
	expect(stub.tabs.update).not.toHaveBeenCalled();
});

it("质量: 非有限坐标抛 bad_args 且不发 CDP", async () => {
	const stub = stubPointer();

	await expect(click({ tabId: 603, x: Number.NaN, y: 2 })).rejects.toThrow(
		"bad_args",
	);
	await expect(
		hover({ tabId: 604, x: 1, y: Number.POSITIVE_INFINITY }),
	).rejects.toThrow("bad_args");

	expect(stub.debugger.sendCommand).not.toHaveBeenCalled();
});

it("质量: selector 匹配不到元素时抛 page_error", async () => {
	const stub = stubPointer({ element: false });

	await expect(click({ tabId: 605, selector: "#nope" })).rejects.toThrow(
		"page_error: selector matched no element: #nope",
	);

	expect(mouseEvents(stub)).toHaveLength(0);
});
