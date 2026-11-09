import { readdirSync, readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import {
	extensionUrl,
	stubChrome,
	uninstallChrome,
} from "../input/chrome-stub.ts";
import { append, el, loadSnapshotPage, PAGE_SOURCE } from "./fake-page.ts";

interface SnapshotModule {
	snapshotPage: (params: {
		tabId: number;
		mode?: string;
		query?: string;
		ref?: string;
		selector?: string;
		maxElements?: number;
		textChars?: number;
	}) => Promise<Record<string, unknown>>;
}

const PAGE_GLOBAL = globalThis as { __piChromeSnapshotPage?: unknown };

async function loadSnapshot(): Promise<SnapshotModule> {
	return (await import(extensionUrl("page/snapshot.js"))) as SnapshotModule;
}

/** 把假页面的采集对象挂到全局，让包装层真的调到它。 */
function mountPage(body: ReturnType<typeof el>): void {
	PAGE_GLOBAL.__piChromeSnapshotPage = loadSnapshotPage({ body }).page;
}

/** 执行 executeScript：注入文件返回空，函数调用就真跑一次。 */
const runInPage = (spec: Record<string, unknown>) =>
	spec.files
		? []
		: [
				{
					result: (spec.func as (...args: unknown[]) => unknown)(
						...(spec.args as unknown[]),
					),
				},
			];

afterEach(() => {
	uninstallChrome();
	vi.unstubAllGlobals();
	vi.resetModules();
	delete PAGE_GLOBAL.__piChromeSnapshotPage;
});

it("AC4: 同一元素连续两次快照得到同一 ref", () => {
	const button = el("button", {}, ["Save"]);
	const page = loadSnapshotPage({ body: el("body", {}, [button]) });

	const first = page.collect();
	const second = page.collect();

	expect(first.elements[0].ref).toBe(second.elements[0].ref);
});

it("AC4: 新元素拿更大的 ref，删掉的元素 ref 不复用", () => {
	const button = el("button", {}, ["Save"]);
	const page = loadSnapshotPage({ body: el("body", {}, [button]) });

	const first = page.collect();
	append(page.body, el("a", { attrs: { href: "/next" } }, ["Next"]));
	const second = page.collect();
	page.body.childNodes.shift();
	const third = page.collect();

	expect(second.elements[1].ref).not.toBe(first.elements[0].ref);
	expect(Number(second.elements[1].ref.slice(1))).toBeGreaterThan(
		Number(first.elements[0].ref.slice(1)),
	);
	expect(third.elements[0].ref).toBe(second.elements[1].ref);
	expect(third.elements[0].ref).not.toBe(first.elements[0].ref);
});

it("深查只在元素不在视口内时滚动，refs 深查不滚", () => {
	const far = el("button", { rect: { x: 0, y: 900, width: 100, height: 20 } }, [
		"Far",
	]);
	const near = el("button", { rect: { x: 0, y: 10, width: 100, height: 20 } }, [
		"Near",
	]);
	const page = loadSnapshotPage({ body: el("body", {}, [far, near]) });
	const [farRef, nearRef] = page
		.collect()
		.elements.map((element) => element.ref);

	page.page.inspect({ ref: farRef });
	expect(far.scrollCalls).toBe(0);

	page.page.inspect({ ref: farRef, scroll: true });
	expect(far.scrollCalls).toBe(1);

	// 已经看得见时不动页面：滚动是副作用，拖动两端的坐标不能被它改掉。
	page.page.inspect({ ref: nearRef, scroll: true });
	expect(near.scrollCalls).toBe(0);
});

it("ref 指向的元素已经掉出文档时报 stale，不拿旧坐标去点", () => {
	const button = el("button", {}, ["Save"]);
	const page = loadSnapshotPage({ body: el("body", {}, [button]) });
	const [ref] = page.collect().elements.map((element) => element.ref);
	button.isConnected = false;

	expect(() => page.page.inspect({ ref })).toThrow(
		`ref ${ref} is stale; take a new snapshot`,
	);
});

it("AC6: 页面没装上全局时抛错，消息里有名字", async () => {
	const stub = stubChrome({
		executeScript: runInPage,
	});
	mountPage(el("body", {}, [el("button", {}, ["Save"])]));
	delete PAGE_GLOBAL.__piChromeSnapshotPage;

	await expect(
		loadSnapshot().then((module) =>
			module.snapshotPage({ tabId: 301, maxElements: 80, textChars: 18_000 }),
		),
	).rejects.toThrow("__piChromeSnapshotPage");
	expect(stub.scripting.executeScript.mock.calls[0][0].files).toEqual([
		"page/snapshot.js",
	]);
});

it("AC2: refs 模式不含正文，含 500 字摘要与最多 80 个元素", async () => {
	const body = el("body");
	for (let index = 0; index < 100; index += 1)
		append(body, el("button", {}, [`Action ${index}`]));
	append(body, el("p", {}, ["x".repeat(900)]));
	mountPage(body);
	stubChrome({ executeScript: runInPage });

	const result = await loadSnapshot().then((module) =>
		module.snapshotPage({ tabId: 302, maxElements: 80, textChars: 18_000 }),
	);

	expect(result.elements as unknown[]).toHaveLength(80);
	expect(String(result.summary)).toHaveLength(500);
	expect(result).not.toHaveProperty("text");
	expect(result).not.toHaveProperty("bodyText");
});

it("AC3: text 模式标题树在前，正文不超过 textChars", async () => {
	const body = el("body", {});
	append(body, el("h1", {}, ["Title"]));
	append(body, el("p", {}, ["y".repeat(200)]));
	mountPage(body);
	stubChrome({ executeScript: runInPage });

	const result = await loadSnapshot().then((module) =>
		module.snapshotPage({
			tabId: 303,
			mode: "text",
			maxElements: 80,
			textChars: 100,
		}),
	);
	const out = String(result.text);
	const bodyText = out.split("\n").slice(1).join("\n");

	expect(out.startsWith("# Title")).toBe(true);
	expect(out.indexOf("# Title")).toBeLessThan(out.indexOf("yyy"));
	expect(bodyText).toHaveLength(100);
	expect(result.truncated).toBe(true);
});

it("AC3: full 模式正文不超过 30,000 字符", async () => {
	const body = el("body", {});
	append(body, el("p", {}, ["y".repeat(40_000)]));
	mountPage(body);
	stubChrome({ executeScript: runInPage });

	const result = await loadSnapshot().then((module) =>
		module.snapshotPage({
			tabId: 304,
			mode: "full",
			maxElements: 80,
			textChars: 18_000,
		}),
	);

	expect(String(result.text)).toHaveLength(30_000);
	expect(result.truncated).toBe(true);
	expect(result.elements).toEqual([]);
});

it("AC5: query 整词命中的元素排第一并过滤掉不相关的", async () => {
	const body = el("body", {});
	append(body, el("button", {}, ["Save settings"]));
	append(body, el("button", {}, ["Delete"]));
	append(body, el("button", {}, ["Save"]));
	mountPage(body);
	stubChrome({ executeScript: runInPage });

	const result = await loadSnapshot().then((module) =>
		module.snapshotPage({
			tabId: 305,
			maxElements: 80,
			textChars: 18_000,
			query: "save",
		}),
	);
	const names = (result.elements as Array<{ name: string }>).map(
		(element) => element.name,
	);

	expect(names[0]).toBe("Save");
	expect(names).not.toContain("Delete");
});

it("AC7: 位置移动不算变化，条目只报三元组", async () => {
	const button = el("button", {}, ["Save"]);
	mountPage(el("body", {}, [button]));
	stubChrome({ executeScript: runInPage });
	const module = await loadSnapshot();
	await module.snapshotPage({ tabId: 306, maxElements: 80, textChars: 18_000 });

	Object.assign(button, { rect: { x: 500, y: 400, width: 10, height: 10 } });
	const result = await module.snapshotPage({
		tabId: 306,
		mode: "changes",
		maxElements: 80,
		textChars: 18_000,
	});
	const changes = result.changes as {
		added: number;
		removed: number;
		updated: number;
		lines: string[];
	};

	expect(changes).toMatchObject({ added: 0, removed: 0, updated: 0 });
	expect(changes.lines).toEqual([]);
});

it("AC8: 第一次快照的 changes 为空并注明没有上一次", async () => {
	mountPage(el("body", {}, [el("button", {}, ["Save"])]));
	stubChrome({ executeScript: runInPage });

	const result = await loadSnapshot().then((module) =>
		module.snapshotPage({ tabId: 307, maxElements: 80, textChars: 18_000 }),
	);
	const changes = result.changes as {
		added: number;
		lines: string[];
		note?: string;
	};

	expect(changes.added).toBe(0);
	expect(changes.lines).toEqual([]);
	expect(changes.note).toBe("no previous snapshot");
});

it("AC8: 基线按标签页保存，跨 mode 切换保留", async () => {
	mountPage(el("body", {}, [el("button", {}, ["Save"])]));
	stubChrome({ executeScript: runInPage });
	const module = await loadSnapshot();
	await module.snapshotPage({ tabId: 308, maxElements: 80, textChars: 18_000 });
	await module.snapshotPage({
		tabId: 308,
		mode: "text",
		maxElements: 80,
		textChars: 18_000,
	});

	const result = await module.snapshotPage({
		tabId: 308,
		mode: "changes",
		maxElements: 80,
		textChars: 18_000,
	});
	const changes = result.changes as { added: number; updated: number };

	expect(changes).toMatchObject({ added: 0, updated: 0 });
});

it("AC9: 同时给 ref 与 selector 时以 ref 为准", async () => {
	mountPage(el("body", {}, [el("button", {}, ["Save"])]));
	stubChrome({ executeScript: runInPage });
	const module = await loadSnapshot();
	const first = await module.snapshotPage({
		tabId: 309,
		maxElements: 80,
		textChars: 18_000,
	});
	const ref = (first.elements as Array<{ ref: string }>)[0].ref;

	const result = await module.snapshotPage({
		tabId: 309,
		ref,
		selector: "#missing",
		maxElements: 80,
		textChars: 18_000,
	});

	expect((result.element as { ref: string }).ref).toBe(ref);
});

it("AC10: changes 不超过 600 字符，超出时末行注明丢弃条数", async () => {
	const body = el("body");
	mountPage(body);
	stubChrome({ executeScript: runInPage });
	const module = await loadSnapshot();
	await module.snapshotPage({ tabId: 310, maxElements: 80, textChars: 18_000 });

	for (let index = 0; index < 40; index += 1)
		append(body, el("button", {}, [`Long action name ${index}`]));
	const result = await module.snapshotPage({
		tabId: 310,
		mode: "changes",
		maxElements: 80,
		textChars: 18_000,
	});
	const lines = (result.changes as { lines: string[] }).lines;

	const kept = lines.length - 1;

	expect(lines.join("\n").length).toBeLessThanOrEqual(600);
	expect(kept).toBeLessThanOrEqual(20);
	expect(lines.at(-1)).toBe(`note: ${40 - kept} more changes dropped`);
});

it("AC11: 注入目录的脚本自包含", () => {
	const dir = new URL("../../../browser-extension/page/", import.meta.url);
	const files = readdirSync(dir).filter((file) => file.endsWith(".js"));

	expect(files).toContain("snapshot.js");
	for (const file of files) {
		const source = readFileSync(new URL(file, dir), "utf8");
		expect(source).not.toMatch(/\b(import|export|require)\b/);
		expect(source).not.toMatch(/import\s*\(/);
	}
});

it("refs 与 full 带 hints，截断时说明还差多少", async () => {
	const body = el("body");
	mountPage(body);
	for (let index = 0; index < 10; index += 1)
		append(body, el("button", {}, [`Action ${index}`]));
	stubChrome({ executeScript: runInPage });
	const module = await loadSnapshot();

	const refs = await module.snapshotPage({
		tabId: 311,
		maxElements: 4,
		textChars: 18_000,
	});
	const full = await module.snapshotPage({
		tabId: 311,
		mode: "full",
		maxElements: 4,
		textChars: 18_000,
	});

	expect((refs.hints as string[])[0]).toContain("6 more elements omitted");
	expect((full.hints as string[])[0]).toContain("6 more elements omitted");
});

it("摘要与正文不含脚本、样式与隐藏子树的文本", async () => {
	const body = el("body");
	append(body, el("p", {}, ["Visible body"]));
	append(body, el("script", {}, ["SECRET_CODE"]));
	append(body, el("div", { visible: false }, ["HIDDEN_TEXT"]));
	mountPage(body);
	stubChrome({ executeScript: runInPage });
	const module = await loadSnapshot();

	const refs = await module.snapshotPage({
		tabId: 312,
		maxElements: 80,
		textChars: 18_000,
	});
	const text = await module.snapshotPage({
		tabId: 312,
		mode: "text",
		maxElements: 80,
		textChars: 18_000,
	});

	expect(String(refs.summary)).toContain("Visible body");
	expect(String(refs.summary)).not.toContain("SECRET_CODE");
	expect(String(refs.summary)).not.toContain("HIDDEN_TEXT");
	expect(String(text.text)).not.toContain("SECRET_CODE");
	expect(String(text.text)).not.toContain("HIDDEN_TEXT");
});

it("标签关掉后删掉它的基线", async () => {
	const stub = stubChrome({ executeScript: runInPage });
	mountPage(el("body", {}, [el("button", {}, ["Save"])]));
	const module = await loadSnapshot();
	await module.snapshotPage({
		tabId: 314,
		maxElements: 80,
		textChars: 18_000,
	});

	stub.emitTabRemoved(314);

	const readStored = stub.storage.session.get as unknown as (
		key: string,
	) => Promise<Record<string, unknown>>;
	expect(await readStored("snapshot.baseline.314")).toEqual({});
});

it("AC6: scripting 被拒时读源码改走 CDP 注入", async () => {
	mountPage(el("body", {}, [el("button", {}, ["Save"])]));
	const stub = stubChrome({
		scriptingError: new Error('Cannot access contents of url "https://x/".'),
		sendResults: [
			undefined,
			{
				result: {
					value: {
						ok: true,
						value: {
							title: "T",
							url: "https://x/",
							headings: [],
							elements: [],
							fields: [],
							bodyText: "",
						},
					},
				},
			},
		],
	});
	const fetched: string[] = [];
	vi.stubGlobal("fetch", async (url: string) => {
		fetched.push(String(url));
		return { text: async () => PAGE_SOURCE };
	});

	const result = await loadSnapshot().then((module) =>
		module.snapshotPage({ tabId: 313, maxElements: 80, textChars: 18_000 }),
	);
	const evaluations = stub.calls.filter(
		(call) => call.method === "Runtime.evaluate",
	);

	expect(fetched).toEqual(["chrome-extension://test/page/snapshot.js"]);
	expect(String(evaluations[0].params.expression)).toContain(
		"__piChromeSnapshotPage",
	);
	expect(result.mode).toBe("refs");
});
