import {
	executeScriptWithFallback,
	injectScriptFile,
} from "../input/debugger.js";

/** 4 个模式。 */
const MODES = new Set(["refs", "text", "changes", "full"]);
/** 注入目录里的采集脚本。 */
const SNAPSHOT_FILE = "page/snapshot.js";
/** `refs` 的摘要上限。 */
const SUMMARY_LIMIT = 500;
/** `full` 的正文上限。 */
const FULL_LIMIT = 30_000;
/** `changes` 的字符与条目上限。 */
const CHANGES_CHARS = 600;
const CHANGES_MAX = 20;
/** 基线在 storage.session 里的键前缀，后面接标签 id。 */
const BASELINE_PREFIX = "snapshot.baseline.";

// 标签关掉后基线不会再被读到，留着只占 storage.session 的配额。
globalThis.chrome?.tabs?.onRemoved?.addListener((tabId) => {
	void chrome.storage.session.remove(`${BASELINE_PREFIX}${tabId}`);
});

/**
 * 取一次页面快照。
 * @param {object} params
 * @param {number} params.tabId 标签 id
 * @param {"refs" | "text" | "changes" | "full"} [params.mode] 模式，默认 `refs`
 * @param {string} [params.query] 自然语言查找，命中越多的元素排越前
 * @param {string} [params.ref] 深查的元素 ref
 * @param {string} [params.selector] 深查的 CSS 选择器，同时给 ref 时以 ref 为准
 * @param {number} params.maxElements 元素上限
 * @param {number} params.textChars `text` 模式的正文上限
 * @returns {Promise<object>} 按模式裁剪过的快照
 */
export async function snapshotPage({
	tabId,
	mode = "refs",
	query,
	ref,
	selector,
	maxElements,
	textChars,
} = {}) {
	if (!MODES.has(mode)) throw new Error(`bad_args: unknown mode: ${mode}`);
	requirePositive(maxElements, "maxElements");
	requirePositive(textChars, "textChars");
	requireOptionalString(query, "query");
	requireOptionalString(ref, "ref");
	requireOptionalString(selector, "selector");
	if (ref || selector) {
		const target = await runPage(tabId, "inspect", { ref, selector });
		return {
			mode,
			url: target.url,
			title: target.title,
			element: target.element,
		};
	}
	const payload = await runPage(tabId, "collect", {});
	const changes = await takeChanges(tabId, payload);
	return format(payload, { mode, query, maxElements, textChars, changes });
}

/**
 * 深查一个元素。指针类动作先用它把 `ref` 换成坐标。
 * @param {number} tabId 标签 id
 * @param {object} target 定位，二选一
 * @param {string} [target.ref] 元素 ref
 * @param {string} [target.selector] CSS 选择器
 * @param {boolean} [target.scroll] 读 rect 前先把元素滚到视口中心，指针动作要它
 * @returns {Promise<{ url: string, title: string, element: object }>} 元素与其所在页面
 */
export async function elementAt(tabId, { ref, selector, scroll } = {}) {
	requireOptionalString(ref, "ref");
	requireOptionalString(selector, "selector");
	return await runPage(tabId, "inspect", { ref, selector, scroll });
}

/**
 * 拍一次基线。改元素的动作前调它，`changesSince` 从这里开始比。
 * @param {number} tabId 标签 id
 * @returns {Promise<void>}
 */
export async function markBaseline(tabId) {
	const payload = await runPage(tabId, "collect", {});
	await writeBaseline(tabId, payload.elements.map(tripleOf));
}

/**
 * 与上一次基线比出增删改，并把当前页写成新基线。
 * @param {number} tabId 标签 id
 * @returns {Promise<{ added: number, removed: number, updated: number }>} 变更量
 */
export async function changesSince(tabId) {
	const payload = await runPage(tabId, "collect", {});
	const { added, removed, updated } = await takeChanges(tabId, payload);
	return { added, removed, updated };
}

/** 按模式裁剪采集结果。 */
function format(payload, { mode, query, maxElements, textChars, changes }) {
	const head = { mode, url: payload.url, title: payload.title };
	if (mode === "changes") return { ...head, changes };
	if (mode === "text")
		return {
			...head,
			text: withHeadings(payload, textChars),
			truncated: payload.bodyText.length > textChars,
		};
	const ranked = rank(payload.elements, query);
	const elements = ranked.slice(0, maxElements);
	const snapshot = {
		...head,
		summary: payload.bodyText.slice(0, SUMMARY_LIMIT),
		headings: payload.headings,
		elements,
		fields: payload.fields,
		hints: hintsFor(payload, ranked, elements, { query, maxElements }),
		changes,
	};
	if (mode !== "full") return snapshot;
	return {
		...snapshot,
		text: payload.bodyText.slice(0, FULL_LIMIT),
		truncated: payload.bodyText.length > FULL_LIMIT,
	};
}

/**
 * 下一步该做什么。只给能动手的提示，字段本身已经说明了页面内容。
 * @returns {string[]} 提示
 */
function hintsFor(payload, ranked, elements, { query, maxElements }) {
	const hints = [];
	if (payload.elements.length === 0) return ["no interactive elements found"];
	if (elements.length === 0) return [`no element matched query "${query}"`];
	if (ranked.length > elements.length)
		hints.push(
			`${ranked.length - elements.length} more elements omitted; narrow with query or raise maxElements (${maxElements})`,
		);
	return hints;
}

/** 标题树在前，正文在后。正文截到 `textChars`。 */
function withHeadings(payload, textChars) {
	const tree = payload.headings.map(
		(heading) => `${"#".repeat(heading.level)} ${heading.text}`,
	);
	const body = payload.bodyText.slice(0, textChars);
	return [...tree, body].filter(Boolean).join("\n");
}

/**
 * 按 `query` 的 token 给元素打分。整串命中加分最多，整词命中次之。
 * @returns {object[]} 排好序的元素
 */
function rank(elements, query) {
	if (!query) return elements;
	const needle = query.toLowerCase();
	const tokens = needle.split(/\s+/).filter(Boolean);
	return elements
		.map((element, index) => ({
			element,
			index,
			score: scoreOf(element, needle, tokens),
		}))
		.filter((entry) => entry.score > 0)
		.sort((a, b) => b.score - a.score || a.index - b.index)
		.map((entry) => entry.element);
}

function scoreOf(element, needle, tokens) {
	const name = String(element.name ?? "").toLowerCase();
	const haystack =
		`${name} ${element.text ?? ""} ${element.tag} ${element.role ?? ""}`.toLowerCase();
	if (
		!haystack.includes(needle) &&
		!tokens.some((token) => haystack.includes(token))
	)
		return 0;
	let score = name === needle ? 10 : 0;
	if (haystack.includes(needle)) score += 2;
	const words = new Set(haystack.split(/\s+/));
	for (const token of tokens)
		score += words.has(token) ? 3 : haystack.includes(token) ? 1 : 0;
	return score;
}

/** 注入采集脚本，再在页面里跑它。 */
async function runPage(tabId, op, args) {
	try {
		await injectScriptFile({ tabId, path: SNAPSHOT_FILE });
	} catch (error) {
		throw new Error(`page_error: ${messageOf(error)}`);
	}
	const [first] = await executeScriptWithFallback({
		tabId,
		func: runPageScript,
		args: [{ op, args }],
		world: "MAIN",
	});
	const envelope = first?.result;
	if (!envelope?.ok)
		throw new Error(
			`page_error: ${envelope?.error ?? "page script returned nothing"}`,
		);
	return envelope.value;
}

/** 在页面里跑采集脚本。字符串化后经 CDP 送去时也成立，所以不能引用模块作用域。 */
function runPageScript({ op, args }) {
	try {
		const page = globalThis.__piChromeSnapshotPage;
		if (!page || typeof page[op] !== "function")
			throw new Error(
				`page script did not install __piChromeSnapshotPage.${op}`,
			);
		return { ok: true, value: page[op](args) };
	} catch (error) {
		return { ok: false, error: String(error?.message ?? error) };
	}
}

/**
 * 读出上一次的基线，写入这一次的，再给出差异。
 * @returns {Promise<{ added: number, removed: number, updated: number, lines: string[], note?: string }>} 差异
 */
async function takeChanges(tabId, payload) {
	const key = `${BASELINE_PREFIX}${tabId}`;
	const current = payload.elements.map(tripleOf);
	const previous = (await chrome.storage.session.get(key))?.[key];
	await writeBaseline(tabId, current);
	if (!Array.isArray(previous))
		return {
			added: 0,
			removed: 0,
			updated: 0,
			lines: [],
			note: "no previous snapshot",
		};
	return summarizeChanges(previous, current);
}

async function writeBaseline(tabId, rows) {
	await chrome.storage.session.set({
		[`${BASELINE_PREFIX}${tabId}`]: rows,
	});
}

/** 元素三元组：标签、角色、可见文本。位置不参与比较。 */
function tripleOf(element) {
	return {
		tag: element.tag,
		role: element.role ?? "",
		text: element.text ?? "",
	};
}

/** 先配平完全相同的三元组，再按标签加角色配对，剩下的算增删。 */
function summarizeChanges(previous, current) {
	const left = countBy(previous);
	const right = countBy(current);
	for (const [key, count] of [...left]) {
		const shared = Math.min(count, right.get(key) ?? 0);
		if (shared === 0) continue;
		left.set(key, count - shared);
		right.set(key, (right.get(key) ?? 0) - shared);
	}
	const before = groupByTagAndRole(left);
	const after = groupByTagAndRole(right);
	const lines = [];
	let added = 0;
	let removed = 0;
	let updated = 0;
	for (const key of new Set([...before.keys(), ...after.keys()])) {
		const old = before.get(key) ?? [];
		const now = after.get(key) ?? [];
		const pairs = Math.min(old.length, now.length);
		for (let index = 0; index < pairs; index += 1) {
			updated += 1;
			lines.push(lineOf("~", now[index]));
		}
		for (const row of now.slice(pairs)) {
			added += 1;
			lines.push(lineOf("+", row));
		}
		for (const row of old.slice(pairs)) {
			removed += 1;
			lines.push(lineOf("-", row));
		}
	}
	return { added, removed, updated, lines: limitLines(lines) };
}

/** 一批三元组按标签加角色分组；计数表还原成行。 */
function groupByTagAndRole(counts) {
	const groups = new Map();
	for (const row of expand(counts)) {
		const key = `${row.tag}|${row.role}`;
		groups.set(key, [...(groups.get(key) ?? []), row]);
	}
	return groups;
}

function noteOf(dropped) {
	return `note: ${dropped} more changes dropped`;
}

function lineOf(mark, row) {
	return `${mark} ${row.tag} ${row.role} "${row.text}"`;
}

/** 一行一个三元组，超出 600 字符就停下，末行注明丢了几条。 */
function limitLines(lines) {
	const kept = [];
	let used = 0;
	for (const line of lines) {
		if (kept.length >= CHANGES_MAX) break;
		if (used + line.length + 1 > CHANGES_CHARS) break;
		kept.push(line);
		used += line.length + 1;
	}
	let dropped = lines.length - kept.length;
	// 末行的说明也算进 600 字符，所以放不下就再退一条。
	while (dropped > 0 && used + noteOf(dropped).length + 1 > CHANGES_CHARS) {
		const last = kept.pop();
		used -= last.length + 1;
		dropped += 1;
	}
	if (dropped > 0) kept.push(noteOf(dropped));
	return kept;
}

function countBy(rows) {
	const counts = new Map();
	for (const row of rows) {
		const key = `${row.tag}|${row.role}|${row.text}`;
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	return counts;
}

/** 把 `tag|role|text` 还原成行；计数表只存个数。 */
function expand(counts) {
	const rows = [];
	for (const [key, count] of counts) {
		const [tag, role, ...rest] = key.split("|");
		const text = rest.join("|");
		for (let index = 0; index < count; index += 1)
			rows.push({ tag, role, text });
	}
	return rows;
}

function requirePositive(value, name) {
	if (!Number.isInteger(value) || value <= 0)
		throw new Error(`bad_args: ${name} must be a positive integer`);
}

function requireOptionalString(value, name) {
	if (value !== undefined && typeof value !== "string")
		throw new Error(`bad_args: ${name} must be a string`);
}

function messageOf(error) {
	return error instanceof Error ? error.message : String(error);
}
