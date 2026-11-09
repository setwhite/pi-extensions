/**
 * 指针事件：移动、点击、悬停、拖动、滚轮。全部走 CDP，不做 DOM 假事件回退（DEC-0007）。
 * Chrome 会丢弃不可见页面的可信输入，所以每个入口先调 assertVisible：不可见就把标签与窗口提到前台。
 */

import { evaluate, sendCommand } from "./debugger.js";

/**
 * 点击一个点或元素。事件序为 mouseMoved、mousePressed、mouseReleased。
 * @param {object} params
 * @param {number} params.tabId 标签 id
 * @param {string} [params.selector] CSS 选择器，与坐标二选一
 * @param {number} [params.x] 视口坐标 x，与 y 一起给
 * @param {number} [params.y] 视口坐标 y
 * @returns {Promise<{ x: number, y: number }>} 实际点击的点
 */
export async function click({ tabId, ...target } = {}) {
	const kind = classifyTarget(target);
	await assertVisible(tabId);
	const point = await resolvePoint(tabId, kind, target);
	await movePointer(tabId, point);
	await dispatchMouse(tabId, "mousePressed", point, {
		button: "left",
		buttons: 1,
		clickCount: 1,
	});
	await dispatchMouse(tabId, "mouseReleased", point, {
		button: "left",
		buttons: 0,
		clickCount: 1,
	});
	return point;
}

/**
 * 悬停：把指针移到点或元素上，只发一次 mouseMoved。
 * @param {object} params
 * @param {number} params.tabId 标签 id
 * @param {string} [params.selector] CSS 选择器，与坐标二选一
 * @param {number} [params.x] 视口坐标 x，与 y 一起给
 * @param {number} [params.y] 视口坐标 y
 * @returns {Promise<{ x: number, y: number }>}
 */
export async function hover({ tabId, ...target } = {}) {
	const kind = classifyTarget(target);
	await assertVisible(tabId);
	const point = await resolvePoint(tabId, kind, target);
	await movePointer(tabId, point);
	return point;
}

/**
 * 拖拽。从按下到松开之间发 steps 次鼠标移动，步数来自配置 input.dragSteps。
 * @param {object} params
 * @param {number} params.tabId 标签 id
 * @param {object} params.from 起点：{ selector } 或 { x, y }
 * @param {object} params.to 终点：{ selector } 或 { x, y }
 * @param {number} params.steps 中间移动次数，来自配置 input.dragSteps
 * @returns {Promise<{ from: { x: number, y: number }, to: { x: number, y: number }, steps: number }>}
 */
export async function drag({ tabId, from, to, steps } = {}) {
	const fromKind = classifyTarget(from ?? {});
	const toKind = classifyTarget(to ?? {});
	requireSteps("dragSteps", steps);
	await assertVisible(tabId);
	const start = await resolvePoint(tabId, fromKind, from);
	const end = await resolvePoint(tabId, toKind, to);
	// 先移到起点：靠 :hover 才出现的拖拽把手要先收到经过，按下才抓得住。
	await movePointer(tabId, start);
	await dispatchMouse(tabId, "mousePressed", start, {
		button: "left",
		buttons: 1,
		clickCount: 1,
	});
	for (let step = 1; step <= steps; step++) {
		const ratio = step / steps;
		await dispatchMouse(
			tabId,
			"mouseMoved",
			{
				x: start.x + (end.x - start.x) * ratio,
				y: start.y + (end.y - start.y) * ratio,
			},
			{ button: "left", buttons: 1 },
		);
	}
	await dispatchMouse(tabId, "mouseReleased", end, {
		button: "left",
		buttons: 0,
		clickCount: 1,
	});
	return { from: start, to: end, steps };
}

/**
 * 滚轮。发 steps 次 mouseWheel，位移平分到每次，落点是视口中心。
 * @param {object} params
 * @param {number} params.tabId 标签 id
 * @param {number} [params.dx] 横向位移，正值向右
 * @param {number} [params.dy] 纵向位移，正值向下
 * @param {number} params.steps 事件次数，来自配置 input.scrollSteps
 * @returns {Promise<{ deltaX: number, deltaY: number, steps: number }>}
 */
export async function scroll({ tabId, dx = 0, dy = 0, steps } = {}) {
	requireSteps("scrollSteps", steps);
	await assertVisible(tabId);
	const center = await viewportCenter(tabId);
	for (let step = 0; step < steps; step++) {
		await sendCommand(tabId, "Input.dispatchMouseEvent", {
			type: "mouseWheel",
			x: center.x,
			y: center.y,
			deltaX: dx / steps,
			deltaY: dy / steps,
			pointerType: "mouse",
		});
	}
	return { deltaX: dx, deltaY: dy, steps };
}

function isFiniteNumber(value) {
	return typeof value === "number" && Number.isFinite(value);
}

function movePointer(tabId, point) {
	return dispatchMouse(tabId, "mouseMoved", point, {
		button: "none",
		buttons: 0,
	});
}

function dispatchMouse(tabId, type, point, extra) {
	return sendCommand(tabId, "Input.dispatchMouseEvent", {
		type,
		x: point.x,
		y: point.y,
		pointerType: "mouse",
		...extra,
	});
}

/** 目标三选一：ref、selector、x+y。ref 由快照解析，pointer 只收后两种。 */
function classifyTarget(target) {
	const hasRef = typeof target.ref === "string" && target.ref !== "";
	const hasSelector =
		typeof target.selector === "string" && target.selector !== "";
	const wantsPoint = target.x !== undefined || target.y !== undefined;
	if (wantsPoint) requirePoint(target);
	const given = [hasRef, hasSelector, wantsPoint].filter(Boolean).length;
	if (given !== 1)
		throw new Error(
			`bad_args: pass exactly one of ref, selector, or x+y; got ${given}`,
		);
	if (hasRef)
		throw new Error(
			"bad_args: ref is resolved by the snapshot; pass selector or x+y",
		);
	return hasSelector ? "selector" : "point";
}

function requirePoint({ x, y }) {
	if (!isFiniteNumber(x) || !isFiniteNumber(y))
		throw new Error("bad_args: x and y must be finite numbers");
	return { x, y };
}

function requireSteps(name, steps) {
	if (!Number.isInteger(steps) || steps < 1)
		throw new Error(`bad_args: ${name} must be a positive integer`);
}

async function resolvePoint(tabId, kind, target) {
	if (kind === "point") return { x: target.x, y: target.y };
	return elementCenter(tabId, target.selector);
}

async function elementCenter(tabId, selector) {
	const expression = `(() => {
	const element = document.querySelector(${JSON.stringify(selector)});
	if (!element) return null;
	// rect 是视口坐标：折叠线外先滚到中间，点到的坐标才在视口里。
	const before = element.getBoundingClientRect();
	if (
		before.x < 0 ||
		before.y < 0 ||
		before.x + before.width > innerWidth ||
		before.y + before.height > innerHeight
	)
		element.scrollIntoView({ block: "center", inline: "center" });
	const rect = element.getBoundingClientRect();
	return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
})()`;
	const center = await evaluate(tabId, expression);
	if (!isFiniteNumber(center?.x) || !isFiniteNumber(center?.y))
		throw new Error(`page_error: selector matched no element: ${selector}`);
	return { x: center.x, y: center.y };
}

async function viewportCenter(tabId) {
	const center = await evaluate(
		tabId,
		"({ x: Math.round(innerWidth / 2), y: Math.round(innerHeight / 2) })",
	);
	if (!isFiniteNumber(center?.x) || !isFiniteNumber(center?.y))
		throw new Error("page_error: could not read viewport size");
	return { x: center.x, y: center.y };
}

/** 聚焦之后等页面变可见的次数与间隔：Chrome 要过一个 tick 才改 visibilityState。 */
const RAISE_TRIES = 6;
const RAISE_WAIT_MS = 50;

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function visibilityState(tabId) {
	return evaluate(tabId, "document.visibilityState");
}

/** 页面为什么不可见，用来让报错指向人能动手的地方。 */
async function hiddenReason(tabId) {
	const tab = await chrome.tabs.get(tabId).catch(() => undefined);
	if (tab?.active === false) return "it is an inactive tab in its window";
	const win =
		tab?.windowId === undefined
			? undefined
			: await chrome.windows.get(tab.windowId).catch(() => undefined);
	if (win?.state === "minimized") return "its window is minimized";
	if (win?.state === "fullscreen")
		return "its window is behind a full-screen window";
	return "its window is covered by another window";
}

/**
 * 输入前确保页面可见。不可见就先激活标签、把窗口带到前台，仍不可见才报错。
 * 激活标签不改窗口焦点，所以这一步只在真需要可信输入时打扰用户。
 */
export async function assertVisible(tabId) {
	const state = await visibilityState(tabId);
	if (state === "visible") return;
	if (state !== "hidden")
		throw new Error(
			`page_error: could not read document.visibilityState for tab ${tabId}`,
		);
	const reason = await hiddenReason(tabId);
	const tab = await chrome.tabs.update(tabId, { active: true });
	await chrome.windows.update(tab.windowId, { focused: true });
	for (let attempt = 0; attempt < RAISE_TRIES; attempt++) {
		await sleep(RAISE_WAIT_MS);
		if ((await visibilityState(tabId)) === "visible") return;
	}
	throw new Error(
		`page_error: tab ${tabId} is hidden because ${reason}; Chrome drops trusted input to hidden pages. Bring the window to the front, then retry`,
	);
}
