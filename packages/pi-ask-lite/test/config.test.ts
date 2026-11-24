import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULTS, loadConfig, resolveConfigPath } from "../src/config.ts";

const dirs: string[] = [];

function tempConfig(content?: string): string {
	const dir = mkdtempSync(join(tmpdir(), "pi-ask-config-"));
	dirs.push(dir);
	const path = join(dir, "pi-ask", "config.json");
	if (content !== undefined) {
		mkdirSync(join(dir, "pi-ask"), { recursive: true });
		writeFileSync(path, content, "utf-8");
	}
	return path;
}

afterEach(() => {
	for (const dir of dirs.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

describe("resolveConfigPath", () => {
	it("走 PI_CODING_AGENT_DIR，拼 pi-ask/config.json", () => {
		expect(
			resolveConfigPath({ env: { PI_CODING_AGENT_DIR: "/tmp/agent" } }),
		).toBe(join(resolve("/tmp/agent"), "pi-ask", "config.json"));
	});
});

describe("loadConfig", () => {
	it("文件缺失时给默认值", () => {
		expect(loadConfig({ configPath: tempConfig() })).toEqual(DEFAULTS);
	});

	it("坏 JSON 报错并带路径", () => {
		const path = tempConfig("{ nope");
		expect(() => loadConfig({ configPath: path })).toThrow(
			/pi-ask config .*invalid JSON/,
		);
	});

	it("未知键报错并带字段路径", () => {
		expect(() =>
			loadConfig({ configPath: tempConfig('{"ui":{"theme":"dark"}}') }),
		).toThrow(/ui\.theme: unknown key/);
		expect(() => loadConfig({ configPath: tempConfig('{"nope":1}') })).toThrow(
			/nope: unknown key/,
		);
	});

	it("类型不符报错并带字段路径", () => {
		expect(() =>
			loadConfig({ configPath: tempConfig('{"ui":{"bell":"yes"}}') }),
		).toThrow(/ui\.bell: expected boolean, got string/);
		expect(() =>
			loadConfig({ configPath: tempConfig('{"limits":{"maxQuestions":0}}') }),
		).toThrow(/limits\.maxQuestions: expected integer >= 1, got 0/);
		expect(() =>
			loadConfig({ configPath: tempConfig('{"keys":{"annotate":""}}') }),
		).toThrow(/keys\.annotate: expected a key/);
	});

	it("maxHeightRatio 越界夹到 0.2-0.8", () => {
		expect(
			loadConfig({ configPath: tempConfig('{"ui":{"maxHeightRatio":1.5}}') }).ui
				.maxHeightRatio,
		).toBe(0.8);
		expect(
			loadConfig({ configPath: tempConfig('{"ui":{"maxHeightRatio":0.05}}') })
				.ui.maxHeightRatio,
		).toBe(0.2);
	});

	it("工具名与 guidance 可覆盖", () => {
		const config = loadConfig({
			configPath: tempConfig(
				'{"tools":{"ask":{"name":"question"}},"guidance":{"description":"D","promptSnippet":"S","promptGuidelines":["tool-name: G"]}}',
			),
		});
		expect(config.tools.ask.name).toBe("question");
		expect(config.guidance).toEqual({
			description: "D",
			promptSnippet: "S",
			promptGuidelines: ["tool-name: G"],
		});
	});

	it("工具名不合法时报错", () => {
		expect(() =>
			loadConfig({ configPath: tempConfig('{"tools":{"ask":{"name":"1x"}}}') }),
		).toThrow(/tools\.ask\.name: expected a tool name/);
	});

	it("默认值里的 guidance 带 tool-name 占位", () => {
		expect(DEFAULTS.guidance.promptSnippet).toContain("tool-name");
		for (const guideline of DEFAULTS.guidance.promptGuidelines) {
			expect(guideline.startsWith("tool-name")).toBe(true);
		}
	});
});
