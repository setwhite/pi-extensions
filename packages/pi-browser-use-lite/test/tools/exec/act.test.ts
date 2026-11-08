import { expect, it } from "vitest";
import { CONFIG, harness, textOf } from "./harness.ts";

it("AC9: wait 不传 timeout_ms 时按 15 秒", async () => {
	const { run, sent } = harness();

	await run("chrome_act", {
		action: "wait",
		kind: "selector",
		value: "#done",
	});

	expect(sent[0].action).toBe("page.waitFor");
	expect(sent[0].params.timeoutMs).toBe(15_000);
	expect(sent[0].timeoutMs).toBe(30_000);
});

it("AC13: 单次调用 30 秒，navigate 按配置加 2 秒", async () => {
	const { run, sent } = harness({
		reply: (action) =>
			action === "page.navigate" ? { id: 9, url: "https://a" } : {},
	});

	await run("chrome_act", { action: "click", ref: "e1" });
	await run("chrome_act", { action: "navigate", url: "https://a" });

	expect(sent[0].timeoutMs).toBe(30_000);
	expect(sent[1].timeoutMs).toBe(CONFIG.timing.navigateTimeoutMs + 2_000);
});

it("AC15: navigate 成功后记下 target", async () => {
	const { run, target } = harness({
		reply: () => ({ id: 9, url: "https://a" }),
	});

	const result = await run("chrome_act", {
		action: "navigate",
		url: "https://a",
	});

	expect(target.get()).toBe(9);
	expect(textOf(result).split("\n")[0]).toBe("ok: navigate https://a");
});

it("判定行与变更行", async () => {
	const { run } = harness({
		reply: () => ({ changed: { added: 1, removed: 0, updated: 2 } }),
	});

	const result = await run("chrome_act", { action: "click", ref: "e12" });

	expect(textOf(result).split("\n")).toStrictEqual([
		"ok: click ref=e12",
		"changed: +1 -0 ~2",
	]);
	expect(result.details).toMatchObject({
		ok: true,
		action: "click",
		changed: { added: 1, removed: 0, updated: 2 },
		ref: "e12",
	});
});

it("AC3: see 在判定行与变更行之后附快照", async () => {
	const { run, sent } = harness({
		reply: (action) => {
			if (action === "page.click")
				return { changed: { added: 0, removed: 0, updated: 1 } };
			return { mode: "text", url: "https://a", title: "A", text: "body" };
		},
	});

	const result = await run("chrome_act", {
		action: "click",
		ref: "e1",
		see: "text",
	});

	expect(sent.map((item) => item.action)).toStrictEqual([
		"page.click",
		"page.snapshot",
	]);
	expect(sent[1].params.mode).toBe("text");
	expect(textOf(result).split("\n").slice(0, 2)).toStrictEqual([
		"ok: click ref=e1",
		"changed: +0 -0 ~1",
	]);
	expect(textOf(result)).toContain("body");
	expect(result.details?.snapshot).toStrictEqual({ mode: "text" });
});

it("AC2: batch 某步失败且没有 optional 时中止，并指出第几步", async () => {
	const { run, sent } = harness({
		reply: (_action, params) => {
			if (params.text === "boom") throw new Error("page_error: oops");
			return {};
		},
	});

	const result = await run("chrome_act", {
		action: "batch",
		steps: [
			{ action: "click", args: { ref: "e1" } },
			{ action: "type", args: { text: "boom" } },
			{ action: "click", args: { ref: "e3" } },
		],
	});

	expect(textOf(result).split("\n")[0]).toBe(
		"page_error: step 2 of 3 failed: oops",
	);
	expect(result.details?.error).toMatchObject({ class: "page_error" });
	expect(result.isError).toBe(true);
	expect(sent.map((item) => item.action)).toStrictEqual([
		"page.click",
		"page.type",
	]);
});

it("AC2: optional 的步骤失败不影响后续", async () => {
	const { run, sent } = harness({
		reply: (_action: unknown, params) => {
			if (params.text === "boom") throw new Error("page_error: oops");
			return {};
		},
	});

	const result = await run("chrome_act", {
		action: "batch",
		steps: [
			{ action: "type", args: { text: "boom" }, optional: true },
			{ action: "click", args: { ref: "e3" } },
		],
	});

	expect(result.isError).toBeUndefined();
	expect(textOf(result)).toContain("step 1 of 2 skipped");
	expect(sent.map((item) => item.action)).toStrictEqual([
		"page.type",
		"page.click",
	]);
});

it("AC4: batch 超过 50 步报 bad_args，且不发任何命令", async () => {
	const { run, sent } = harness();
	const steps = Array.from({ length: 51 }, () => ({
		action: "click",
		args: { ref: "e1" },
	}));

	const result = await run("chrome_act", { action: "batch", steps });

	expect(textOf(result).split("\n")[0]).toBe(
		"bad_args: batch takes at most 50 steps, got 51",
	);
	expect(sent).toStrictEqual([]);
});

it("AC5: 扩展报未授权时锁定的信封", async () => {
	const { run } = harness({
		reply: () => {
			throw new Error("locked: browser control is locked");
		},
	});

	const result = await run("chrome_act", { action: "click", ref: "e1" });

	const lines = textOf(result).split("\n");
	expect(lines[0].startsWith("locked:")).toBe(true);
	expect(lines[1].startsWith("hint:")).toBe(true);
	expect(result.details?.error).toMatchObject({ class: "locked" });
});

it("扩展没连上时报 extension_missing，不发命令", async () => {
	const { run, sent } = harness({ connected: false });

	const result = await run("chrome_act", { action: "click", ref: "e1" });

	expect(textOf(result).split("\n")[0]).toBe(
		"extension_missing: the browser extension is not connected on 127.0.0.1:17318",
	);
	expect(sent).toStrictEqual([]);
});

it("缺定位方式时报 bad_args", async () => {
	const { run, sent } = harness();

	const result = await run("chrome_act", { action: "click" });

	expect(textOf(result).split("\n")[0]).toBe(
		"bad_args: click needs ref, selector or x with y",
	);
	expect(sent).toStrictEqual([]);
});

it("AC10: 默认全局规则里有一条讲 see 多花 token", async () => {
	const { DEFAULTS } = await import("../../../src/config/index.ts");

	const rule = DEFAULTS.prompt.guidelines.find(
		(line) =>
			line.includes("chrome_act") &&
			line.includes("see") &&
			line.includes("token"),
	);

	expect(rule).toBeDefined();
});
