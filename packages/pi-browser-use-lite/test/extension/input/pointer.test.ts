import { afterEach, expect, it, vi } from "vitest";
import { DEFAULTS } from "../../../src/config/index.ts";

type Mock = ReturnType<typeof vi.fn>;

interface MouseEvent {
	type: string;
	x: number;
	y: number;
	button?: string;
	buttons?: number;
	deltaY?: number;
}

interface ChromeStub {
	calls: Array<{ method: string; params: Record<string, unknown> }>;
	debugger: { attach: Mock; sendCommand: Mock };
	tabs: { update: Mock };
}

interface PointerModule {
	click: (target: Record<string, unknown>) => Promise<{ x: number; y: number }>;
	hover: (target: Record<string, unknown>) => Promise<{ x: number; y: number }>;
	moveMouse: (
		target: Record<string, unknown>,
	) => Promise<{ x: number; y: number }>;
	drag: (target: Record<string, unknown>) => Promise<unknown>;
	scroll: (target: Record<string, unknown>) => Promise<unknown>;
}

/** 扩展侧的 JS 没有类型声明，用文件 URL 动态载入。 */
function extensionUrl(path: string): string {
	return new URL(
		`../../../browser-extension/background/input/${path}`,
		import.meta.url,
	).href;
}

const { click, hover, moveMouse, drag, scroll } = (await import(
	extensionUrl("pointer.js")
)) as PointerModule;

const RECT = { left: 8, top: 16, width: 4, height: 8, x: 10, y: 20 };

/** 挂 chrome 桩。Runtime.evaluate 按表达式回三种结果：可见性、元素中心、视口中心。 */
function stubChrome(
	options: { visibility?: string; element?: boolean } = {},
): ChromeStub {
	const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
	const visibility = options.visibility ?? "visible";
	const element = options.element ?? true;
	const sendCommand = vi.fn(
		async (
			_target: unknown,
			method: string,
			params: Record<string, unknown>,
		) => {
			calls.push({ method, params });
			if (method !== "Runtime.evaluate") return {};
			const expression = String(params.expression);
			if (expression === "document.visibilityState") {
				if (visibility === "unreadable") return {};
				return { result: { value: visibility } };
			}
			if (expression.includes("querySelector"))
				return { result: { value: element ? { x: RECT.x, y: RECT.y } : null } };
			return { result: { value: { x: 400, y: 300 } } };
		},
	);
	const debuggerStub = {
		attach: vi.fn(async () => undefined),
		sendCommand,
	};
	const tabs = { update: vi.fn(async () => ({})) };
	(globalThis as { chrome?: unknown }).chrome = {
		debugger: debuggerStub,
		tabs,
	};
	return { calls, debugger: debuggerStub, tabs };
}

function mouseEvents(stub: ChromeStub): MouseEvent[] {
	return stub.calls
		.filter((call) => call.method === "Input.dispatchMouseEvent")
		.map((call) => call.params as unknown as MouseEvent);
}

afterEach(() => {
	delete (globalThis as { chrome?: unknown }).chrome;
});

it("AC7: 一个定位都没给时抛 bad_args 且不发 CDP", async () => {
	const stub = stubChrome();

	await expect(click({ tabId: 101 })).rejects.toThrow("bad_args");

	expect(stub.debugger.sendCommand).not.toHaveBeenCalled();
});

it("AC7: 同时给 selector 与坐标时抛 bad_args 且不发 CDP", async () => {
	const stub = stubChrome();

	await expect(
		click({ tabId: 102, selector: "#a", x: 1, y: 2 }),
	).rejects.toThrow("bad_args");

	expect(stub.debugger.sendCommand).not.toHaveBeenCalled();
});

it("AC7: 只给 ref 时抛 bad_args，ref 由快照解析", async () => {
	const stub = stubChrome();

	await expect(click({ tabId: 103, ref: "e3" })).rejects.toThrow("bad_args");

	expect(stub.debugger.sendCommand).not.toHaveBeenCalled();
});

it("AC2/AC3: 按 selector 点击落在元素矩形内，事件序为 moved、pressed、released", async () => {
	const stub = stubChrome();

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

it("AC2: 按坐标点击直接使用给定坐标", async () => {
	const stub = stubChrome();

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

it("AC4: 目标标签不可见时抛错，不发鼠标事件，也不激活标签", async () => {
	const stub = stubChrome({ visibility: "hidden" });

	await expect(click({ tabId: 203, selector: "#a" })).rejects.toThrow("hidden");

	expect(mouseEvents(stub)).toHaveLength(0);
	expect(stub.tabs.update).not.toHaveBeenCalled();
});

it("AC5: dragSteps 为 3 时发出 3 次中间 mouseMoved", async () => {
	const stub = stubChrome();

	await drag({
		tabId: 301,
		from: { x: 10, y: 10 },
		to: { x: 40, y: 40 },
		steps: 3,
	});

	const events = mouseEvents(stub);
	expect(events[0].type).toBe("mousePressed");
	expect(events.at(-1)?.type).toBe("mouseReleased");
	const moves = events.filter((event) => event.type === "mouseMoved");
	expect(moves).toHaveLength(3);
	expect(moves.every((event) => event.button === "left")).toBe(true);
	expect(moves.every((event) => event.buttons === 1)).toBe(true);
	expect(moves.at(-1)).toMatchObject({ x: 40, y: 40 });
});

it("AC5: 默认配置 10 步时 drag 发出 10 次中间 mouseMoved", async () => {
	const stub = stubChrome();

	await drag({
		tabId: 302,
		from: { x: 0, y: 0 },
		to: { x: 100, y: 50 },
		steps: DEFAULTS.input.dragSteps,
	});

	const moves = mouseEvents(stub).filter(
		(event) => event.type === "mouseMoved",
	);
	expect(moves).toHaveLength(10);
});

it("AC6: scrollSteps 为 2 时发出恰好 2 个 mouseWheel 事件", async () => {
	const stub = stubChrome();

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
	const stub = stubChrome();

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
	const stub = stubChrome();

	const point = await hover({ tabId: 501, selector: "#menu" });

	expect(mouseEvents(stub).map((event) => event.type)).toEqual(["mouseMoved"]);
	expect(point).toEqual({ x: RECT.x, y: RECT.y });
});

it("质量: moveMouse 也查可见性，不可见时不发事件", async () => {
	const stub = stubChrome({ visibility: "hidden" });

	await expect(moveMouse({ tabId: 601, x: 1, y: 2 })).rejects.toThrow(
		"page_error",
	);

	expect(mouseEvents(stub)).toHaveLength(0);
});

it("质量: 可见性读不到时抛 page_error，不当作可见", async () => {
	const stub = stubChrome({ visibility: "unreadable" });

	await expect(click({ tabId: 602, x: 1, y: 2 })).rejects.toThrow("page_error");

	expect(mouseEvents(stub)).toHaveLength(0);
});

it("质量: 非有限坐标抛 bad_args 且不发 CDP", async () => {
	const stub = stubChrome();

	await expect(click({ tabId: 603, x: Number.NaN, y: 2 })).rejects.toThrow(
		"bad_args",
	);
	await expect(
		moveMouse({ tabId: 604, x: 1, y: Number.POSITIVE_INFINITY }),
	).rejects.toThrow("bad_args");

	expect(stub.debugger.sendCommand).not.toHaveBeenCalled();
});

it("质量: selector 匹配不到元素时抛 page_error", async () => {
	const stub = stubChrome({ element: false });

	await expect(click({ tabId: 605, selector: "#nope" })).rejects.toThrow(
		"page_error: selector matched no element: #nope",
	);

	expect(mouseEvents(stub)).toHaveLength(0);
});
