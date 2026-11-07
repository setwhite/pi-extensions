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
	await dispatchKey(tabId, info, {
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
	if (await isContentEditable(tabId)) {
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
 * @param {Array<{ selector: string, value: string }>} params.fields 字段列表
 * @returns {Promise<{ filled: string[] }>} 已填写的选择器
 */
export async function fill({ tabId, fields } = {}) {
	if (!Array.isArray(fields) || fields.length === 0)
		throw new Error("bad_args: fields must be a non-empty array");
	for (const field of fields) {
		if (typeof field?.selector !== "string" || field.selector === "")
			throw new Error("bad_args: every field needs a selector");
		if (typeof field.value !== "string")
			throw new Error("bad_args: every field needs a string value");
	}
	const filled = [];
	for (const field of fields) {
		await click({ tabId, selector: field.selector });
		await type({ tabId, text: field.value, replace: true });
		filled.push(field.selector);
	}
	return { filled };
}

/** 用 Chrome 的 selectAll 编辑命令选中，再发一次删除。命令与平台无关。 */
async function selectAllAndDelete(tabId) {
	await dispatchKey(
		tabId,
		{ key: "a", code: "KeyA", vk: 65 },
		{ type: "rawKeyDown", modifiers: CTRL, text: "", commands: ["selectAll"] },
	);
	await dispatchKey(tabId, { key: "Delete", code: "Delete", vk: 46 });
}

/**
 * 发一个键事件。所有键盘事件的载荷只在这里拼。
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
}

async function isContentEditable(tabId) {
	const editable = await evaluate(
		tabId,
		"document.activeElement?.isContentEditable === true",
	);
	return editable === true;
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
