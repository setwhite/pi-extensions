import { expect, it } from "vitest";
import { CONFIG, harness, textOf } from "./harness.ts";

it("refs 是默认模式，上限取配置", async () => {
	const { run, sent } = harness({
		reply: () => ({
			mode: "refs",
			url: "https://a",
			title: "A",
			summary: "hello",
			elements: [{ ref: "e1", tag: "button", name: "Go" }],
			hints: ["nothing else"],
			changes: { added: 0, removed: 0, updated: 0, lines: [] },
		}),
	});

	const result = await run("chrome_see", {});

	expect(sent[0].action).toBe("page.snapshot");
	expect(sent[0].params).toMatchObject({
		mode: "refs",
		maxElements: CONFIG.output.maxElements,
		textChars: CONFIG.output.textChars,
	});
	expect(textOf(result).split("\n")).toContain('  e1 button "Go"');
	expect(textOf(result)).toContain("hint: nothing else");
	expect(result.details).toMatchObject({
		mode: "refs",
		url: "https://a",
		title: "A",
	});
});

it("changes 模式把变更量放进 details", async () => {
	const { run } = harness({
		reply: () => ({
			mode: "changes",
			url: "https://a",
			title: "A",
			changes: { added: 1, removed: 0, updated: 0, lines: ['+ button "Go"'] },
		}),
	});

	const result = await run("chrome_see", { mode: "changes" });

	expect(textOf(result)).toContain("changed: +1 -0 ~0");
	expect(textOf(result)).toContain('+ button "Go"');
	expect(result.details).toMatchObject({
		mode: "changes",
		changes: { added: 1, removed: 0, updated: 0 },
	});
});

it("logs 走网络或控制台清单，不读快照", async () => {
	const { run, sent } = harness({
		reply: () => ({ records: [{ status: 200, url: "https://a" }] }),
	});

	const result = await run("chrome_see", { logs: "network", clear: true });

	expect(sent[0].action).toBe("page.network.list");
	expect(sent[0].params).toMatchObject({ clear: true });
	expect(textOf(result)).toBe('{"status":200,"url":"https://a"}');
});

it("logs 为空时给一行说明，不回空正文", async () => {
	const { run } = harness({ reply: () => ({ records: [] }) });

	const result = await run("chrome_see", { logs: "console" });

	expect(textOf(result)).toBe("no console records captured for this tab");
	expect(result.details).toMatchObject({ logs: "console", count: 0 });
});

it("request_id 取单条请求详情", async () => {
	const { run, sent } = harness({
		reply: () => ({ url: "https://a", body: "x" }),
	});

	await run("chrome_see", { logs: "network", request_id: "r1" });

	expect(sent[0].action).toBe("page.network.get");
	expect(sent[0].params).toMatchObject({ requestId: "r1" });
});
