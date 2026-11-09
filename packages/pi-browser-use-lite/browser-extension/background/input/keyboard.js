import { evaluate, sendCommand } from "./debugger.js";
import { assertVisible, click } from "./pointer.js";

/** CDP 的 modifiers 位。 */
const ALT = 1;
const CTRL = 2;
const META = 4;
const SHIFT = 8;

const MODIFIERS = {
	alt: ALT,
	option: ALT,
	ctrl: CTRL,
	control: CTRL,
	meta: META,
	cmd: META,
	command: META,
	shift: SHIFT,
};

/** 修饰键本身的事件表。按下顺序 Meta、Ctrl、Alt、Shift，松开反过来。 */
const MODIFIER_KEYS = [
	{ bit: META, key: "Meta", code: "MetaLeft", vk: 91 },
	{ bit: CTRL, key: "Control", code: "ControlLeft", vk: 17 },
	{ bit: ALT, key: "Alt", code: "AltLeft", vk: 18 },
	{ bit: SHIFT, key: "Shift", code: "ShiftLeft", vk: 16 },
];

/** 非可打印键。text 是按下时 Chrome 插入的字符。 */
const SPECIAL = {
	Enter: { code: "Enter", vk: 13, text: "\r" },
	Tab: { code: "Tab", vk: 9, text: "\t" },
	Backspace: { code: "Backspace", vk: 8, text: "" },
	Delete: { code: "Delete", vk: 46, text: "" },
	Escape: { code: "Escape", vk: 27, text: "" },
	ArrowLeft: { code: "ArrowLeft", vk: 37, text: "" },
	ArrowUp: { code: "ArrowUp", vk: 38, text: "" },
	ArrowRight: { code: "ArrowRight", vk: 39, text: "" },
	ArrowDown: { code: "ArrowDown", vk: 40, text: "" },
	Home: { code: "Home", vk: 36, text: "" },
	End: { code: "End", vk: 35, text: "" },
	PageUp: { code: "PageUp", vk: 33, text: "" },
	PageDown: { code: "PageDown", vk: 34, text: "" },
};

/** 可打印字符到物理键位。Shift 变体与基准键共用 code 与键码。 */
const PRINTABLE = {
	" ": { code: "Space", vk: 32 },
	"`": { code: "Backquote", vk: 192 },
	"~": { code: "Backquote", vk: 192 },
	"-": { code: "Minus", vk: 189 },
	_: { code: "Minus", vk: 189 },
	"=": { code: "Equal", vk: 187 },
	"+": { code: "Equal", vk: 187 },
	"[": { code: "BracketLeft", vk: 219 },
	"{": { code: "BracketLeft", vk: 219 },
	"]": { code: "BracketRight", vk: 221 },
	"}": { code: "BracketRight", vk: 221 },
	"\\": { code: "Backslash", vk: 220 },
	"|": { code: "Backslash", vk: 220 },
	";": { code: "Semicolon", vk: 186 },
	":": { code: "Semicolon", vk: 186 },
	"'": { code: "Quote", vk: 222 },
	'"': { code: "Quote", vk: 222 },
	",": { code: "Comma", vk: 188 },
	"<": { code: "Comma", vk: 188 },
	".": { code: "Period", vk: 190 },
	">": { code: "Period", vk: 190 },
	"/": { code: "Slash", vk: 191 },
	"?": { code: "Slash", vk: 191 },
	"!": { code: "Digit1", vk: 49 },
	"@": { code: "Digit2", vk: 50 },
	"#": { code: "Digit3", vk: 51 },
	$: { code: "Digit4", vk: 52 },
	"%": { code: "Digit5", vk: 53 },
	"^": { code: "Digit6", vk: 54 },
	"&": { code: "Digit7", vk: 55 },
	"*": { code: "Digit8", vk: 56 },
	"(": { code: "Digit9", vk: 57 },
	")": { code: "Digit0", vk: 48 },
};

/**
 * 按键一次。组合键写成 `Ctrl+A`，字母统一大写。
 * @param {object} params
 * @param {number} params.tabId 标签 id
 * @param {string} params.key 单个键或组合键
 * @returns {Promise<{ key: string, modifiers: number }>}
 */
export async function press({ tabId, key } = {}) {
	const chord = parseChord(key);
	const info = keyInfo(chord.key);
	if (!info) throw new Error(`bad_args: unknown key: ${chord.key}`);
	await assertVisible(tabId);
	const shortcut = (chord.modifiers & (ALT | CTRL | META)) !== 0;
	await dispatchChord(tabId, info, {
		type: shortcut ? "rawKeyDown" : "keyDown",
		modifiers: chord.modifiers,
		text: shortcut ? "" : info.text,
	});
	return { key: info.key, modifiers: chord.modifiers };
}

/**
 * 在焦点元素上输入文本。普通输入框逐字符发按键事件，contenteditable 走一次原生插入。
 * @param {object} params
 * @param {number} params.tabId 标签 id
 * @param {string} params.text 要输入的文本
 * @param {boolean} [params.replace] 先清空焦点元素的内容
 * @returns {Promise<{ length: number, mode: string }>}
 */
export async function type({ tabId, text = "", replace = false } = {}) {
	if (typeof text !== "string")
		throw new Error("bad_args: text must be a string");
	await assertVisible(tabId);
	if (replace) await selectAllAndDelete(tabId);
	const chars = Array.from(text);
	if (chars.length === 0) return { length: 0, mode: "none" };
	const kind = await focusedKind(tabId);
	// 点击落在字段中间，光标就在中间。不先移到末尾，追加会变成插进正文。
	// 焦点在 iframe 编辑器或别处时不挪光标：按键照发，由页面决定收不收。
	if (!replace && kind !== "none") await moveCaretToEnd(tabId);
	if (kind === "editable") {
		await sendCommand(tabId, "Input.insertText", { text });
		return { length: chars.length, mode: "insertText" };
	}
	for (const char of chars) await typeChar(tabId, char);
	return { length: chars.length, mode: "keys" };
}

/**
 * 逐字段填充：先点击字段聚焦，再整体替换内容。
 * @param {object} params
 * @param {number} params.tabId 标签 id
 * @param {Array<{ selector?: string, x?: number, y?: number, locate?: () => Promise<object>, value: string }>} params.fields 字段列表；带 ref 的字段用 `locate` 在点击前换成坐标
 * @returns {Promise<{ filled: string[] }>} 已填写的定位
 */
export async function fill({ tabId, fields } = {}) {
	if (!Array.isArray(fields) || fields.length === 0)
		throw new Error("bad_args: fields must be a non-empty array");
	for (const field of fields) {
		if (typeof field?.locate !== "function") fieldTarget(field);
		if (typeof field.value !== "string")
			throw new Error("bad_args: every field needs a string value");
	}
	const filled = [];
	for (const field of fields) {
		const target =
			typeof field.locate === "function"
				? await field.locate()
				: fieldTarget(field);
		await click({ tabId, ...target });
		await type({ tabId, text: field.value, replace: true });
		filled.push(field.selector ?? field.ref ?? `${target.x},${target.y}`);
	}
	return { filled };
}

/** 字段定位：坐标优先，其次 selector。ref 由 dispatch 的 `locate` 在点击前换成坐标。 */
function fieldTarget(field) {
	if (Number.isFinite(field?.x) && Number.isFinite(field?.y))
		return { x: field.x, y: field.y };
	if (typeof field?.selector === "string" && field.selector !== "")
		return { selector: field.selector };
	throw new Error("bad_args: every field needs a ref, selector or x+y");
}

/** 把光标移到末尾。编辑命令与平台无关，输入框与 contenteditable 都认。 */
async function moveCaretToEnd(tabId) {
	await dispatchKey(
		tabId,
		{ key: "End", code: "End", vk: 35 },
		{ type: "rawKeyDown", commands: ["moveToEndOfDocument"] },
	);
}

/** 用 Chrome 的 selectAll 编辑命令选中，再发一次删除。命令与平台无关。 */
async function selectAllAndDelete(tabId) {
	await dispatchChord(
		tabId,
		{ key: "a", code: "KeyA", vk: 65 },
		{ type: "rawKeyDown", modifiers: CTRL, text: "", commands: ["selectAll"] },
	);
	await dispatchKey(tabId, { key: "Delete", code: "Delete", vk: 46 });
}

/**
 * 发一对键事件。所有键盘事件的载荷只在这里拼。
 * keyUp 不带 text 与 commands：文本与编辑命令只在按下时生效。
 * @param {number} tabId 标签 id
 * @param {{ key: string, code: string, vk: number, text?: string }} info 键位信息
 * @param {{ type?: string, modifiers?: number, text?: string, commands?: string[] }} [options] 事件选项
 * @returns {Promise<void>}
 */
async function dispatchKey(
	tabId,
	info,
	{ type = "keyDown", modifiers = 0, text = info.text ?? "", commands } = {},
) {
	const event = {
		type,
		key: info.key,
		code: info.code,
		windowsVirtualKeyCode: info.vk,
		modifiers,
		text,
		unmodifiedText: text,
	};
	if (commands) event.commands = commands;
	await sendCommand(tabId, "Input.dispatchKeyEvent", event);
	await sendCommand(tabId, "Input.dispatchKeyEvent", {
		type: "keyUp",
		key: info.key,
		code: info.code,
		windowsVirtualKeyCode: info.vk,
		modifiers,
	});
}

/**
 * 发组合键：先按下修饰键，再发主键的一对事件，最后逆序松开修饰键。
 * 修饰位同时写进每个事件：CDP 不会因为按了 Control 就替后续事件改 modifiers。
 */
async function dispatchChord(
	tabId,
	info,
	{ type = "keyDown", modifiers = 0, text = "", commands } = {},
) {
	const pressed = MODIFIER_KEYS.filter(
		(modifier) => (modifiers & modifier.bit) !== 0,
	);
	for (const modifier of pressed) {
		await sendCommand(tabId, "Input.dispatchKeyEvent", {
			type: "keyDown",
			key: modifier.key,
			code: modifier.code,
			windowsVirtualKeyCode: modifier.vk,
			modifiers,
		});
	}
	await dispatchKey(tabId, info, { type, modifiers, text, commands });
	// 松开一个修饰键时，其余仍按住的位保留：页面读 keyup 的 ctrlKey 才准。
	let held = modifiers;
	for (const modifier of pressed.reverse()) {
		held &= ~modifier.bit;
		await sendCommand(tabId, "Input.dispatchKeyEvent", {
			type: "keyUp",
			key: modifier.key,
			code: modifier.code,
			windowsVirtualKeyCode: modifier.vk,
			modifiers: held,
		});
	}
}

/** 焦点元素的类别：可编辑正文、输入框，或都不是（比如焦点在 iframe 里）。 */
async function focusedKind(tabId) {
	const kind = await evaluate(
		tabId,
		'(() => { const el = document.activeElement; if (el === null) return "none"; if (el.isContentEditable === true) return "editable"; return el.tagName === "INPUT" || el.tagName === "TEXTAREA" ? "field" : "none"; })()',
	);
	return kind === "editable" || kind === "field" ? kind : "none";
}

/** 键位表外的字符（中文、emoji）只带 text，靠 Chrome 插入。 */
async function typeChar(tabId, char) {
	const info = keyInfo(char) ?? { key: char, code: "", vk: 0 };
	await dispatchKey(tabId, info, { text: char });
}

function parseChord(key) {
	if (typeof key !== "string" || key.trim() === "")
		throw new Error("bad_args: key is required");
	const parts = key.split("+");
	const name = parts.pop()?.trim() ?? "";
	if (name === "") throw new Error("bad_args: key is required");
	let modifiers = 0;
	for (const part of parts) {
		const bit = MODIFIERS[part.trim().toLowerCase()];
		if (bit === undefined)
			throw new Error(`bad_args: unknown modifier: ${part.trim()}`);
		modifiers |= bit;
	}
	const normalized = /^[a-z]$/.test(name) ? name.toUpperCase() : name;
	return { key: normalized, modifiers };
}

/** 键位表查询。表外的键名返回 null。 */
function keyInfo(key) {
	const special = SPECIAL[key];
	if (special)
		return { key, code: special.code, vk: special.vk, text: special.text };
	const printable = PRINTABLE[key];
	if (printable)
		return { key, code: printable.code, vk: printable.vk, text: key };
	if (/^[A-Z]$/.test(key))
		return { key, code: `Key${key}`, vk: key.charCodeAt(0), text: key };
	if (/^[a-z]$/.test(key))
		return {
			key,
			code: `Key${key.toUpperCase()}`,
			vk: key.toUpperCase().charCodeAt(0),
			text: key,
		};
	if (/^[0-9]$/.test(key))
		return { key, code: `Digit${key}`, vk: key.charCodeAt(0), text: key };
	return null;
}
