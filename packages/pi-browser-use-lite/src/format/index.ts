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

/** 值转文本：字符串原样给，其余按 JSON。`undefined` 按 `null`，与 JSON 一致。 */
export function valueText(value: unknown): string {
	if (typeof value === "string") return value;
	return JSON.stringify(value) ?? "null";
}

/** 标签页清单：每行 `<id> <*|> [组名] <标题> <url>`。 */
export function tabsText(tabs: readonly TabInfo[]): string {
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
	elements?: {
		ref: string;
		tag?: string;
		role?: string;
		name?: string;
		text?: string;
	}[];
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

function elementLine(element: {
	ref: string;
	tag?: string;
	role?: string;
	name?: string;
	text?: string;
}): string {
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
