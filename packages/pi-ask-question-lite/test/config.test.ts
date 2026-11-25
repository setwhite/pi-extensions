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

	it("折叠键默认 ctrl+]、提示默认开", () => {
		expect(DEFAULTS.keys.collapse).toBe("ctrl+]");
		expect(DEFAULTS.ui.showHints).toBe(true);
	});

	it("collapse 可以是具体按键或 off", () => {
		const key = loadConfig({
			configPath: tempConfig('{"keys":{"collapse":"alt+x"}}'),
		});
		expect(key.keys.collapse).toBe("alt+x");
		const off = loadConfig({
			configPath: tempConfig('{"keys":{"collapse":"off"}}'),
		});
		expect(off.keys.collapse).toBe("off");
	});

	it("collapse 格式不严就报错", () => {
		for (const bad of ["ctrl++", "Ctrl+]", "ctrl+", "shift+ctrl+x", "foo"]) {
			expect(
				() =>
					loadConfig({
						configPath: tempConfig(JSON.stringify({ keys: { collapse: bad } })),
					}),
				bad,
			).toThrow(/keys\.collapse: expected/);
		}
	});

	it("collapse 不能占导航键或已配的键", () => {
		expect(() =>
			loadConfig({ configPath: tempConfig('{"keys":{"collapse":"down"}}') }),
		).toThrow(/keys\.collapse: "down" is reserved for down/);
		expect(() =>
			loadConfig({ configPath: tempConfig('{"keys":{"collapse":"1"}}') }),
		).toThrow(/reserved for 1/);
		expect(() =>
			loadConfig({
				configPath: tempConfig('{"keys":{"collapse":"ctrl+i"}}'),
			}),
		).toThrow(/reserved for tab/);
		expect(() =>
			loadConfig({ configPath: tempConfig('{"keys":{"collapse":"e"}}') }),
		).toThrow(/keys\.collapse: "e" conflicts with keys\.annotate/);
		expect(() =>
			loadConfig({
				configPath: tempConfig('{"keys":{"collapse":"ctrl+enter"}}'),
			}),
		).toThrow(/conflicts with keys\.submitEarly/);
	});

	it("showHints 类型不符报错", () => {
		expect(() =>
			loadConfig({ configPath: tempConfig('{"ui":{"showHints":"yes"}}') }),
		).toThrow(/ui\.showHints: expected boolean, got string/);
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

	it("默认 description 说明何时该问", () => {
		expect(DEFAULTS.guidance.description).toBe(
			"Ask structured questions when user intent or trade-offs are unclear.",
		);
	});

	it("默认不注册 promptSnippet", () => {
		expect(DEFAULTS.guidance.promptSnippet).toBe("");
	});

	it("默认 guidelines 五条，tool-name 占位只在开头", () => {
		expect(DEFAULTS.guidance.promptGuidelines).toEqual([
			"tool-name: Check code, docs, or tools first; only ask when user intent or trade-offs are unclear.",
			"tool-name: Ask only independent questions together; defer follow-ups that depend on earlier answers.",
			"tool-name: Put the recommended option first, keep `label` short, and explain trade-offs in `detail`.",
			"tool-name: Put concrete examples, code, or layouts in `preview` when options differ in behavior.",
			"tool-name: Set `multiple: true` only when choices are not mutually exclusive.",
		]);
		for (const guideline of DEFAULTS.guidance.promptGuidelines) {
			expect(guideline.slice("tool-name: ".length)).not.toContain("tool-name");
		}
	});
});
