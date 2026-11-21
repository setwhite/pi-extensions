import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	utimesSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_MAX_BYTES } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it } from "vitest";
import { finalizeContent, pruneSpillRoot, SPILL_MAX_AGE_MS } from "../../src/tools/result.ts";

const roots: string[] = [];
afterEach(() => {
	for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function makeRoot(): string {
	const dir = mkdtempSync(join(tmpdir(), "pi-web-search-lite-spill-"));
	roots.push(dir);
	return dir;
}

const NOW = 1_700_000_000_000;

describe("finalizeContent", () => {
	it("未超限时原样返回且不落盘", async () => {
		const root = makeRoot();
		const outcome = await finalizeContent("短文本", {
			maxInlineChars: null,
			maxInlineLines: null,
			spillToFile: true,
			spillRoot: root,
		});

		expect(outcome).toEqual({ content: "短文本", truncated: false, fullOutputPath: undefined });
		expect(readdirSync(root)).toEqual([]);
	});

	it("按 maxInlineLines 截断，写到 <root>/<session>/<stem>-<stamp>.md", async () => {
		const root = makeRoot();
		const text = Array.from({ length: 500 }, (_, index) => `第 ${index} 行`).join("\n");

		const outcome = await finalizeContent(text, {
			maxInlineChars: null,
			maxInlineLines: 10,
			spillToFile: true,
			spillRoot: root,
			sessionId: "session-1",
			fileStem: "web-fetch",
			now: () => NOW,
		});

		expect(outcome.truncated).toBe(true);
		expect(outcome.fullOutputPath).toBe(join(root, "session-1", `web-fetch-${NOW}.md`));
		expect(outcome.content).toContain("[... output truncated:");
		expect(outcome.content).toContain(outcome.fullOutputPath ?? "");
		expect(readFileSync(outcome.fullOutputPath ?? "", "utf-8")).toBe(text);
	});

	it("同一会话同一毫秒再截断一次：文件名加序号，不覆盖上一条路径", async () => {
		const root = makeRoot();
		const options = {
			maxInlineChars: 1_000,
			maxInlineLines: null,
			spillToFile: true,
			spillRoot: root,
			sessionId: "session-1",
			fileStem: "web-search",
			now: () => NOW,
		};

		const first = await finalizeContent("甲".repeat(2_000), options);
		const second = await finalizeContent("乙".repeat(2_000), options);

		expect(first.fullOutputPath).toBe(join(root, "session-1", `web-search-${NOW}.md`));
		expect(second.fullOutputPath).toBe(join(root, "session-1", `web-search-${NOW}-2.md`));
		expect(readFileSync(first.fullOutputPath ?? "", "utf-8")).toBe("甲".repeat(2_000));
		expect(readFileSync(second.fullOutputPath ?? "", "utf-8")).toBe("乙".repeat(2_000));
	});

	it.each(["../escape", "..", ".", "有中文", "x".repeat(65)])(
		"会话 id 不能当目录名（%s）时归到 unscoped，不逃出 spill 根",
		async (sessionId) => {
			const root = makeRoot();

			const outcome = await finalizeContent("x".repeat(10_000), {
				maxInlineChars: 1_000,
				maxInlineLines: null,
				spillToFile: true,
				spillRoot: root,
				sessionId,
				now: () => NOW,
			});

			expect(outcome.fullOutputPath).toBe(join(root, "unscoped", `output-${NOW}.md`));
		},
	);

	it("写盘失败时降级：仍返回截断内容，并写明没写成", async () => {
		const root = makeRoot();
		const blocked = join(root, "as-file");
		writeFileSync(blocked, "x");

		const outcome = await finalizeContent("x".repeat(10_000), {
			maxInlineChars: 1_000,
			maxInlineLines: null,
			spillToFile: true,
			spillRoot: blocked,
		});

		expect(outcome.truncated).toBe(true);
		expect(outcome.fullOutputPath).toBeUndefined();
		expect(outcome.content).toContain("[... output truncated:");
		expect(outcome.content).toContain("Full output not written:");
	});

	it("spillToFile 为 false 时不写文件，仍说明已截断", async () => {
		const root = makeRoot();
		const outcome = await finalizeContent("x".repeat(10_000), {
			maxInlineChars: 1_000,
			maxInlineLines: null,
			spillToFile: false,
			spillRoot: root,
		});

		expect(outcome.truncated).toBe(true);
		expect(outcome.fullOutputPath).toBeUndefined();
		expect(outcome.content).toContain("[... output truncated:");
		expect(outcome.content).toContain("spillToFile");
		expect(readdirSync(root)).toEqual([]);
	});

	it("配置上限超过宿主上限时按宿主上限截断", async () => {
		const outcome = await finalizeContent("x".repeat(DEFAULT_MAX_BYTES + 1_000), {
			maxInlineChars: 100_000_000,
			maxInlineLines: 1_000_000,
			spillToFile: false,
			spillRoot: makeRoot(),
		});

		expect(outcome.truncated).toBe(true);
		expect(outcome.content.length).toBeLessThan(DEFAULT_MAX_BYTES);
	});
});

describe("pruneSpillRoot", () => {
	it("删掉超过保留期的会话目录，留下新的、以及根下的散文件", async () => {
		const root = makeRoot();
		const old = join(root, "old-session");
		const fresh = join(root, "fresh-session");
		mkdirSync(old);
		mkdirSync(fresh);
		writeFileSync(join(old, "web-fetch-1.md"), "x");
		writeFileSync(join(fresh, "web-fetch-2.md"), "x");

		const strayFile = join(root, "stray.md");
		writeFileSync(strayFile, "x");
		const longAgo = (Date.now() - SPILL_MAX_AGE_MS - 60_000) / 1_000;
		utimesSync(old, longAgo, longAgo);
		utimesSync(strayFile, longAgo, longAgo);

		await pruneSpillRoot(root);

		expect(existsSync(old)).toBe(false);
		expect(existsSync(fresh)).toBe(true);
		expect(existsSync(strayFile)).toBe(true);
	});

	it("根不存在时安静返回", async () => {
		await expect(pruneSpillRoot(join(makeRoot(), "nope"))).resolves.toBeUndefined();
	});
});
