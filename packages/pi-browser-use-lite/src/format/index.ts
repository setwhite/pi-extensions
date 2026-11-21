/**
 * 结构化结果转模型可见文本的纯函数：不读文件、不读配置、不看时间。
 * 类型在本地定义，谁也不依赖，免得往叶子模块带进协议类型。
 */

/** 一次操作的变更量：元素三元组（标签、角色、可见文本）的计数。 */
export interface Changed {
	added: number;
	removed: number;
	updated: number;
}

/** 一条标签页信息的可见字段。`group` 是组名，不在组里时不带。 */
export interface TabInfo {
	id: number;
	active?: boolean;
	title?: string;
	url?: string;
}

/** 一条错误的固定两行：`<class>: <原因>` 与 `hint: <下一步>`。没有下一步时只留第一行。 */
export function errorText(error: {
	class: string;
	message: string;
	hint: string;
}): string {
	const first = `${error.class}: ${error.message}`;
	return error.hint === "" ? first : `${first}\nhint: ${error.hint}`;
}

/** 变更行：`+增 -删 ~改`。 */
export function changedLine(changed: Changed): string {
	return `changed: +${changed.added} -${changed.removed} ~${changed.updated}`;
}

/**
 * 动作顺带开的新标签。目标标签自己的 URL 不变，模型只能靠这一行知道页面开了新页，
 * 否则会把「URL 没变」读成「动作没生效」再按一遍。
 */
export function openedLine(opened: readonly TabInfo[]): string {
	const [first] = opened;
	if (opened.length === 1 && first !== undefined)
		return `opened: +1 ${tabLine(first)} ${nextTabHint(String(first.id))}`;
	return [
		`opened: +${opened.length} ${nextTabHint("<id>")}`,
		...opened.map((tab) => `  ${tabLine(tab)}`),
	].join("\n");
}

/**
 * 新标签的 id 已经在这一行里，提醒下一轮直接拿它当 `tab`：
 * 否则模型会为了拿 id 再调一次 `chrome_tab list`，多一轮往返。
 */
function nextTabHint(id: string): string {
	return `(next: tab=${id})`;
}

/** 剪枝后的文本与是否剪过。 */
export interface Cut {
	text: string;
	truncated: boolean;
}

/**
 * `eval` 的返回值按字符预算截断。能 parse 成 JSON 的按结构剪，
 * 预览仍是合法 JSON；剪不动结构的退回按字符切，末尾补一句下一步。
 */
export function evalText(value: unknown, limit: number): Cut {
	return cutText(
		value,
		limit,
		(dropped) =>
			`[eval output cut at ${limit} characters: ${dropped} more dropped; filter or slice in JS and return only what you need]`,
	);
}

/**
 * `cdp` 的返回值与 `eval` 共用 `output.evalChars`：两者都是模型自己要的
 * 原始数据，同一个预算就够，不必再加一个配置项。
 */
export function cdpText(value: unknown, limit: number): Cut {
	return cutText(
		value,
		limit,
		(dropped) =>
			`[cdp output cut at ${limit} characters: ${dropped} more dropped; ask the expression for less, or use chrome_act eval]`,
	);
}

/** 超预算时的公共剪法。`tail` 只给按字符切这条路用：按结构剪的说明在 JSON 里。 */
function cutText(
	value: unknown,
	limit: number,
	tail: (dropped: number) => string,
): Cut {
	const raw = valueText(value);
	if (raw.length <= limit) return { text: raw, truncated: false };
	const parsed = parsedJson(value);
	if (parsed !== undefined) {
		const text = JSON.stringify(prune(parsed, limit));
		if (text !== undefined && text.length <= limit) {
			return { text, truncated: true };
		}
	}
	const dropped = raw.length - limit;
	return { text: `${raw.slice(0, limit)}\n${tail(dropped)}`, truncated: true };
}

/** 剪枝时塞进 JSON 里的丢弃标记：一串字符，JSON 照样合法，模型也读得出少了什么。 */
function droppedMarker(dropped: number): string {
	return `… ${dropped} more dropped`;
}

/** 给标记留的余量：宁可少留一条，也不超预算。 */
function markerReserve(dropped: number): number {
	return droppedMarker(dropped).length + 4;
}

/** 把值剪进预算：数组留前几项、对象留前几个键，末尾补一条丢弃标记。 */
function prune(value: unknown, budget: number): unknown {
	const text = JSON.stringify(value);
	if (text !== undefined && text.length <= budget) return value;
	if (typeof value === "string") {
		return `${value.slice(0, Math.max(0, budget - 2))}…`;
	}
	if (Array.isArray(value)) return pruneItems(value, budget);
	if (typeof value === "object" && value !== null) {
		return pruneEntries(value as Record<string, unknown>, budget);
	}
	return value;
}

function pruneItems(items: readonly unknown[], budget: number): unknown[] {
	const kept: unknown[] = [];
	let used = 2;
	for (let index = 0; index < items.length; index += 1) {
		const reserve = markerReserve(items.length - index);
		const allowance = budget - used - reserve - 1;
		if (allowance <= 4) break;
		const item = prune(items[index], allowance);
		const size = (JSON.stringify(item) ?? "null").length;
		if (used + size + 1 + reserve > budget) break;
		kept.push(item);
		used += size + 1;
	}
	const dropped = items.length - kept.length;
	if (dropped > 0) kept.push(droppedMarker(dropped));
	return kept;
}

function pruneEntries(
	entries: Record<string, unknown>,
	budget: number,
): Record<string, unknown> {
	const kept: Record<string, unknown> = {};
	const keys = Object.keys(entries);
	let used = 2;
	for (let index = 0; index < keys.length; index += 1) {
		const key = keys[index] as string;
		const reserve = markerReserve(keys.length - index);
		const keySize = JSON.stringify(key).length + 1;
		const allowance = budget - used - reserve - keySize - 1;
		if (allowance <= 4) break;
		const item = prune(entries[key], allowance);
		const size = (JSON.stringify(item) ?? "null").length;
		if (used + keySize + size + 1 + reserve > budget) break;
		kept[key] = item;
		used += keySize + size + 1;
	}
	const dropped = keys.length - Object.keys(kept).length;
	if (dropped > 0) kept["…"] = droppedMarker(dropped);
	return kept;
}

/** 对象直接用，字符串先试着 parse；parse 不了的当普通文本。 */
function parsedJson(value: unknown): unknown {
	if (typeof value === "object" && value !== null) return value;
	if (typeof value !== "string") return undefined;
	try {
		return JSON.parse(value) as unknown;
	} catch {
		return undefined;
	}
}
/** 值转文本：字符串原样给，其余按 JSON。`undefined` 按 `null`，与 JSON 一致。 */
export function valueText(value: unknown): string {
	if (typeof value === "string") return value;
	return JSON.stringify(value) ?? "null";
}

/** 标签页清单：每行 `<id> <*|> [组名] <标题> <url>`。 */
export function tabsText(tabs: readonly TabInfo[]): string {
	// 空列表不能回空字符串：模型会把「没有标签」读成「工具没输出」。
	if (tabs.length === 0) return "no tabs in this session yet";
	return tabs.map(tabLine).join("\n");
}

/** 候选列表：最多 `limit` 行，被截断时首行注明总数。 */
export function candidatesText(tabs: readonly TabInfo[], limit = 5): string {
	const shown = tabs.slice(0, limit).map(tabLine);
	if (tabs.length <= limit) return shown.join("\n");
	return [
		`showing ${limit} of ${tabs.length} candidates:`,
		...shown.map((line) => `  ${line}`),
	].join("\n");
}

/** 一条页面快照里执行器用到的字段。扩展侧的形状见 background/page/snapshot.js。 */
export interface Snapshot {
	mode: string;
	url?: string;
	title?: string;
	summary?: string;
	headings?: { level: number; text: string }[];
	elements?: SnapshotElement[];
	fields?: {
		ref: string;
		tag?: string;
		name?: string;
		value?: string;
		checked?: boolean;
	}[];
	hints?: string[];
	changes?: Changed & { lines?: string[]; note?: string };
	text?: string;
	truncated?: boolean;
	element?: Record<string, unknown>;
}

/** 一条元素行用到的字段。渲染与预算都只看这几个字段。 */
export interface SnapshotElement {
	ref: string;
	tag?: string;
	role?: string;
	name?: string;
	text?: string;
}

/** 元素块的表头。预算按渲染后的整块算，所以表头与换行也要计入。 */
const ELEMENTS_TITLE_CHARS = "elements:".length + 1;

/**
 * 把元素清单裁到 `budget` 字符内，按渲染后的行长度算。
 * 至少留一条：一条都留不下时模型看不到任何元素，比超预算更糟。
 */
export function limitElements(
	elements: readonly SnapshotElement[],
	budget: number,
): { elements: SnapshotElement[]; omitted: number } {
	const kept: SnapshotElement[] = [];
	let used = ELEMENTS_TITLE_CHARS;
	for (const element of elements) {
		const cost = elementLine(element).length + 3; // 两格缩进 + 换行
		if (kept.length > 0 && used + cost > budget) break;
		kept.push(element);
		used += cost;
	}
	return { elements: kept, omitted: elements.length - kept.length };
}

/** 快照的正文：标题行、摘要、标题树、元素、表单、hints、变更，最后是正文或深查结果。 */
export function snapshotText(snapshot: Snapshot): string {
	const lines: string[] = [];
	if (snapshot.url !== undefined) lines.push(`url: ${snapshot.url}`);
	if (snapshot.title !== undefined) lines.push(`title: ${snapshot.title}`);
	if (snapshot.summary !== undefined && snapshot.summary !== "")
		lines.push(`summary: ${snapshot.summary}`);
	pushBlock(lines, "headings", snapshot.headings?.map(headingLine));
	pushBlock(lines, "elements", snapshot.elements?.map(elementLine));
	pushBlock(lines, "fields", snapshot.fields?.map(fieldLine));
	for (const hint of snapshot.hints ?? []) lines.push(`hint: ${hint}`);
	const changes = snapshot.changes;
	if (changes !== undefined) {
		lines.push(changedLine(changes));
		for (const line of changes.lines ?? []) lines.push(`  ${line}`);
		if (changes.note !== undefined) lines.push(`note: ${changes.note}`);
	}
	if (snapshot.text !== undefined) lines.push(snapshot.text);
	if (snapshot.element !== undefined)
		lines.push(`element: ${JSON.stringify(snapshot.element)}`);
	if (snapshot.truncated === true) lines.push("[truncated]");
	return lines.join("\n");
}

/** 落盘的截图：每个文件一行。 */
export function savedText(paths: readonly string[]): string {
	return paths.map((path) => `Saved ${path}`).join("\n");
}

function pushBlock(
	lines: string[],
	title: string,
	body: readonly string[] | undefined,
): void {
	if (body === undefined || body.length === 0) return;
	lines.push(`${title}:`);
	for (const line of body) lines.push(`  ${line}`);
}

function headingLine(heading: { level: number; text: string }): string {
	return `h${heading.level} ${heading.text}`;
}

function elementLine(element: SnapshotElement): string {
	const parts = [element.ref, element.role || element.tag || ""];
	if (element.name !== undefined && element.name !== "") {
		parts.push(quote(element.name));
	}
	if (
		element.text !== undefined &&
		element.text !== "" &&
		element.text !== element.name
	) {
		parts.push(quote(element.text));
	}
	return parts.filter((part) => part !== "").join(" ");
}

function fieldLine(field: {
	ref: string;
	tag?: string;
	name?: string;
	value?: string;
	checked?: boolean;
}): string {
	const name =
		field.name === undefined || field.name === "" ? "" : `[${field.name}]`;
	const state =
		field.checked === undefined
			? `=${quote(field.value ?? "")}`
			: `=${field.checked ? "checked" : "unchecked"}`;
	return `${field.ref} ${field.tag ?? "field"}${name}${state}`;
}

function quote(text: string): string {
	return `"${text}"`;
}

function tabLine(tab: TabInfo): string {
	const parts = [String(tab.id), tab.active ? "*" : ""];
	parts.push(tab.title ?? "", tab.url ?? "");
	return parts.filter((part) => part !== "").join(" ");
}
