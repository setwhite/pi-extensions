import { expect, it } from "vitest";
import { FULL_PAGE_TIMEOUT_MS } from "../../../src/tools/exec/common.ts";
import { CONFIG, harness, textOf } from "./harness.ts";

it("视口截屏是一张，content 给路径", async () => {
	const { run, sent } = harness({
		reply: () => ({ format: "png", images: [{ data: "AA==" }] }),
	});

	const result = await run("chrome_vision", {});

	expect(sent[0].action).toBe("page.screenshot");
	expect(sent[0].params).toMatchObject({
		format: CONFIG.screenshot.format,
		fullPage: false,
	});
	expect(textOf(result)).toBe("Saved /tmp/shot-1.png");
	expect(result.details).toStrictEqual({ path: "/tmp/shot-1.png" });
});

it("整页截屏超时 120 秒，分块时每个文件一行", async () => {
	const { run, sent } = harness({
		reply: () => ({ format: "png", images: [{ data: "a" }, { data: "b" }] }),
	});

	const result = await run("chrome_vision", { full_page: true });

	expect(sent[0].timeoutMs).toBe(FULL_PAGE_TIMEOUT_MS);
	expect(textOf(result).split("\n")).toStrictEqual([
		"Saved /tmp/shot-1.png",
		"Saved /tmp/shot-2.png",
	]);
	expect(result.details).toStrictEqual({
		path: "/tmp/shot-1.png",
		tiles: 2,
	});
});

it("扩展不给图时报 page_error", async () => {
	const { run } = harness({ reply: () => ({ images: [] }) });

	const result = await run("chrome_vision", {});

	expect(textOf(result).split("\n")[0]).toBe(
		"page_error: the extension returned no image data",
	);
});
