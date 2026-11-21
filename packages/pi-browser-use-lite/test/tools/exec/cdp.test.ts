import { expect, it } from "vitest";
import { CONFIG, harness, textOf } from "./harness.ts";

it("AC16: chrome_cdp 把方法原样转给扩展", async () => {
	const { run, sent } = harness({ reply: () => ({ result: { ok: 1 } }) });

	const result = await run("chrome_cdp", { method: "Runtime.evaluate" });

	expect(sent[0]).toMatchObject({
		action: "cdp.call",
		params: { method: "Runtime.evaluate" },
	});
	expect(textOf(result)).toBe('{"ok":1}');
	expect(result.details).toMatchObject({ result: { ok: 1 } });
});

it("chrome_cdp 返回值超过 output.evalChars 时按结构剪并标 truncated", async () => {
	const rows = Array.from({ length: 1_000 }, (_, index) => `row-${index}`);
	const { run } = harness({ reply: () => ({ result: { rows } }) });

	const result = await run("chrome_cdp", { method: "Runtime.evaluate" });
	const text = textOf(result);

	expect(result.details?.truncated).toBe(true);
	expect(text.length).toBeLessThanOrEqual(CONFIG.output.evalChars);
	const parsed = JSON.parse(text) as { rows: unknown[] };
	expect(Array.isArray(parsed.rows)).toBe(true);
	expect(text).toContain("more dropped");
});

it("短 cdp 结果不标 truncated", async () => {
	const { run } = harness({ reply: () => ({ result: [1, 2] }) });

	const result = await run("chrome_cdp", { method: "Runtime.evaluate" });

	expect(textOf(result)).toBe("[1,2]");
	expect(result.details?.truncated).toBeUndefined();
});
