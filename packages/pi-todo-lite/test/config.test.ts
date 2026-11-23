import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULTS, loadConfig, resolveConfigPath } from "../src/config.ts";

const createdDirs: string[] = [];

function makeTempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "pi-todo-lite-test-"));
	createdDirs.push(dir);
	return dir;
}

function writeConfig(content: string): string {
	const path = join(makeTempDir(), "config.json");
	writeFileSync(path, content, "utf-8");
	return path;
}

function writeAgentConfig(content: string): string {
	const agentDir = join(makeTempDir(), "agent");
	mkdirSync(join(agentDir, "pi-todo"), { recursive: true });
	writeFileSync(join(agentDir, "pi-todo", "config.json"), content, "utf-8");
	return agentDir;
}

function captureError(run: () => unknown): string {
	try {
		run();
	} catch (error) {
		return error instanceof Error ? error.message : String(error);
	}
	throw new Error("期望抛出错误，但调用成功返回");
}

afterEach(() => {
	for (const dir of createdDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

describe("resolveConfigPath", () => {
	it("入参 configPath 优先，并转成绝对路径", () => {
		expect(
			resolveConfigPath({ configPath: "relative/config.json", env: {} }),
		).toBe(join(process.cwd(), "relative", "config.json"));
	});

	it("没有 configPath 时取 $PI_CODING_AGENT_DIR 下的 pi-todo/config.json", () => {
		const agentDir = join(makeTempDir(), "agent");

		expect(resolveConfigPath({ env: { PI_CODING_AGENT_DIR: agentDir } })).toBe(
			join(agentDir, "pi-todo", "config.json"),
		);
	});

	it("$PI_CODING_AGENT_DIR 是相对路径时按 cwd 解析成绝对路径", () => {
		expect(
			resolveConfigPath({ env: { PI_CODING_AGENT_DIR: "relative/agent" } }),
		).toBe(join(process.cwd(), "relative", "agent", "pi-todo", "config.json"));
	});

	it("都没有时落到 ~/.pi/agent/pi-todo/config.json", () => {
		expect(resolveConfigPath({ env: {} })).toBe(
			join(homedir(), ".pi", "agent", "pi-todo", "config.json"),
		);
	});
});

describe("loadConfig：零行高界面（AC1）", () => {
	it("缺省时 ui.mode 是 overlay，浮窗四键取默认值", () => {
		const path = join(makeTempDir(), "missing", "config.json");
		const config = loadConfig({ configPath: path, env: {} });

		expect(config.ui.mode).toBe("overlay");
		expect(config.ui.overlay).toEqual({
			anchor: "top-right",
			width: 36,
			minTerminalWidth: 100,
			margin: { top: 1, right: 2, bottom: 3, left: 1 },
		});
	});

	it("ui.mode 只认 overlay 与 status", () => {
		const path = writeConfig(JSON.stringify({ ui: { mode: "widget" } }));

		expect(captureError(() => loadConfig({ configPath: path, env: {} }))).toBe(
			`pi-todo config ${path}: ui.mode: expected one of overlay | status, got "widget"`,
		);
	});

	it("旧的 ui.widget.placement 直接报错，并指出新字段路径", () => {
		const path = writeConfig(
			JSON.stringify({ ui: { widget: { placement: "aboveEditor" } } }),
		);

		expect(captureError(() => loadConfig({ configPath: path, env: {} }))).toBe(
			`pi-todo config ${path}: ui.widget.placement: removed; use ui.mode ("overlay" | "status")`,
		);
	});

	it("ui.overlay.anchor 只认九宫格", () => {
		const path = writeConfig(
			JSON.stringify({ ui: { overlay: { anchor: "middle" } } }),
		);

		expect(
			captureError(() => loadConfig({ configPath: path, env: {} })),
		).toContain(
			'ui.overlay.anchor: expected one of top-left | top-center | top-right | left-center | center | right-center | bottom-left | bottom-center | bottom-right, got "middle"',
		);
	});

	it("minTerminalWidth 必须是正整数：0 与负数都报错，不 clamp", () => {
		for (const value of [0, -5]) {
			const path = writeConfig(
				JSON.stringify({ ui: { overlay: { minTerminalWidth: value } } }),
			);

			expect(
				captureError(() => loadConfig({ configPath: path, env: {} })),
			).toContain(
				`ui.overlay.minTerminalWidth: expected positive integer, got ${value}`,
			);
		}

		const path = writeConfig(
			JSON.stringify({ ui: { overlay: { minTerminalWidth: 40.5 } } }),
		);

		expect(
			captureError(() => loadConfig({ configPath: path, env: {} })),
		).toContain("ui.overlay.minTerminalWidth: expected integer, got 40.5");
	});

	it("width 接受正整数与百分比字符串，0 与乱写的串报错", () => {
		const ok = writeConfig(
			JSON.stringify({ ui: { overlay: { width: "40%" } } }),
		);
		expect(loadConfig({ configPath: ok, env: {} }).ui.overlay.width).toBe(
			"40%",
		);

		for (const value of [0, 12.5, "0%", "wide", ""]) {
			const path = writeConfig(
				JSON.stringify({ ui: { overlay: { width: value } } }),
			);

			expect(
				captureError(() => loadConfig({ configPath: path, env: {} })),
			).toContain("ui.overlay.width: expected positive integer or percentage");
		}
	});

	it("margin 逐边合并，负数报错", () => {
		const path = writeConfig(
			JSON.stringify({ ui: { overlay: { margin: { bottom: 0 } } } }),
		);

		expect(loadConfig({ configPath: path, env: {} }).ui.overlay.margin).toEqual(
			{ top: 1, right: 2, bottom: 0, left: 1 },
		);

		const bad = writeConfig(
			JSON.stringify({ ui: { overlay: { margin: { left: -1 } } } }),
		);

		expect(
			captureError(() => loadConfig({ configPath: bad, env: {} })),
		).toContain(
			"ui.overlay.margin.left: expected non-negative integer, got -1",
		);
	});
});

describe("loadConfig", () => {
	it("配置文件缺失时全部取默认值，不报错", () => {
		const path = join(makeTempDir(), "missing", "config.json");

		expect(loadConfig({ configPath: path, env: {} })).toEqual(DEFAULTS);
	});

	it("部分字段缺省时其余沿用默认值，嵌套对象逐键合并", () => {
		const path = writeConfig(
			JSON.stringify({
				plan: { maxTasks: 5 },
				ui: { widget: { glyphs: { pending: "o" } } },
			}),
		);
		const config = loadConfig({ configPath: path, env: {} });

		expect(config.plan.maxTasks).toBe(5);
		expect(config.plan.maxSubjectChars).toBe(DEFAULTS.plan.maxSubjectChars);
		expect(config.ui.widget.glyphs).toEqual({
			pending: "o",
			inProgress: "[-]",
			completed: "[x]",
		});
		expect(config.ui.widget.header).toBe(DEFAULTS.ui.widget.header);
	});

	it("每次返回独立对象，改返回值不动 DEFAULTS", () => {
		const path = join(makeTempDir(), "missing", "config.json");
		const first = loadConfig({ configPath: path, env: {} });

		first.guidance.promptGuidelines.push("extra");
		first.ui.widget.glyphs.pending = "?";

		expect(DEFAULTS.guidance.promptGuidelines).toHaveLength(3);
		expect(
			loadConfig({ configPath: path, env: {} }).ui.widget.glyphs.pending,
		).toBe("[ ]");
	});

	it("JSON 损坏：报绝对路径与 invalid JSON", () => {
		const path = writeConfig("{ not json");
		const message = captureError(() =>
			loadConfig({ configPath: path, env: {} }),
		);

		expect(message.startsWith(`pi-todo config ${path}: invalid JSON`)).toBe(
			true,
		);
	});

	it("顶层不是对象：报 expected object, got <值>", () => {
		const path = writeConfig("5");
		const message = captureError(() =>
			loadConfig({ configPath: path, env: {} }),
		);

		expect(message).toBe(`pi-todo config ${path}: expected object, got 5`);
	});

	it("对象位置放数组或标量：报字段路径 + expected object", () => {
		const arrayPath = writeConfig(JSON.stringify({ plan: [] }));

		expect(
			captureError(() => loadConfig({ configPath: arrayPath, env: {} })),
		).toBe(
			`pi-todo config ${arrayPath}: plan: expected object, got array of 0`,
		);
	});

	it("未知键在任意层级都报完整字段路径", () => {
		const rootPath = writeConfig(JSON.stringify({ nope: 1 }));
		const deepPath = writeConfig(
			JSON.stringify({
				ui: { widget: { glyphs: { pending: "[ ]", typo: "x" } } },
			}),
		);

		expect(
			captureError(() => loadConfig({ configPath: rootPath, env: {} })),
		).toContain("nope: unknown key");
		expect(
			captureError(() => loadConfig({ configPath: deepPath, env: {} })),
		).toContain("ui.widget.glyphs.typo: unknown key");
	});

	it("类型错按 expected <类型>, got <值> 报，字符串带回引号", () => {
		const path = writeConfig(
			JSON.stringify({ ui: { widget: { maxLines: "9" } } }),
		);

		expect(captureError(() => loadConfig({ configPath: path, env: {} }))).toBe(
			`pi-todo config ${path}: ui.widget.maxLines: expected number, got "9"`,
		);
	});

	it("超长字符串在报错里被截断，不回显全文", () => {
		const path = writeConfig(
			JSON.stringify({ ui: { widget: { maxLines: "9".repeat(500) } } }),
		);
		const message = captureError(() =>
			loadConfig({ configPath: path, env: {} }),
		);

		expect(message).toBe(
			`pi-todo config ${path}: ui.widget.maxLines: expected number, got ${JSON.stringify("9".repeat(32))}…`,
		);
		expect(message.length).toBeLessThan(200);

		const longPath = writeConfig(
			JSON.stringify({ ui: { widget: { maxLines: `a${"𠀋".repeat(40)}` } } }),
		);

		expect(
			captureError(() => loadConfig({ configPath: longPath, env: {} })),
		).toBe(
			`pi-todo config ${longPath}: ui.widget.maxLines: expected number, got ${JSON.stringify(`a${"𠀋".repeat(31)}`)}…`,
		);
	});

	it("布尔与非整数都按类型错拒绝", () => {
		const boolPath = writeConfig(
			JSON.stringify({ plan: { requireSingleInProgress: "true" } }),
		);
		const floatPath = writeConfig(
			JSON.stringify({ ui: { widget: { maxLines: 4.5 } } }),
		);

		expect(
			captureError(() => loadConfig({ configPath: boolPath, env: {} })),
		).toContain('plan.requireSingleInProgress: expected boolean, got "true"');
		expect(
			captureError(() => loadConfig({ configPath: floatPath, env: {} })),
		).toContain("ui.widget.maxLines: expected integer, got 4.5");
	});

	it("枚举错列出全部合法值", () => {
		const path = writeConfig(
			JSON.stringify({ lifecycle: { onFinish: "faded" } }),
		);

		expect(captureError(() => loadConfig({ configPath: path, env: {} }))).toBe(
			`pi-todo config ${path}: lifecycle.onFinish: expected one of model | keep | clear, got "faded"`,
		);
	});

	it("工具名不合法时代码报字段路径", () => {
		const path = writeConfig(
			JSON.stringify({ tools: { todo: { name: "1todo" } } }),
		);

		expect(
			captureError(() => loadConfig({ configPath: path, env: {} })),
		).toContain(
			'tools.todo.name: expected a name starting with a letter and containing only letters, digits or underscores, got "1todo"',
		);
	});

	it("字符串数组逐元素报下标", () => {
		const path = writeConfig(
			JSON.stringify({ guidance: { promptGuidelines: ["ok", 3] } }),
		);

		expect(
			captureError(() => loadConfig({ configPath: path, env: {} })),
		).toContain("guidance.promptGuidelines[1]: expected string, got 3");
	});

	it("多处错误一次列完，不半途而废", () => {
		const path = writeConfig(
			JSON.stringify({
				nope: 1,
				plan: { maxTasks: "20" },
				ui: { widget: { maxLines: "9", completedStyle: "faded" } },
			}),
		);
		const lines = captureError(() =>
			loadConfig({ configPath: path, env: {} }),
		).split("\n");

		expect(lines).toEqual([
			`pi-todo config ${path}: nope: unknown key`,
			'plan.maxTasks: expected number, got "20"',
			'ui.widget.maxLines: expected number, got "9"',
			'ui.widget.completedStyle: expected one of strikethrough | dim | plain, got "faded"',
		]);
	});

	it("数值越界 clamp 到上界，不报错", () => {
		const path = writeConfig(
			JSON.stringify({
				plan: { maxTasks: 500, maxSubjectChars: 1000 },
				ui: { widget: { maxLines: 50 } },
			}),
		);
		const config = loadConfig({ configPath: path, env: {} });

		expect([
			config.plan.maxTasks,
			config.plan.maxSubjectChars,
			config.ui.widget.maxLines,
		]).toEqual([200, 400, 10]);
	});

	it("数值越界 clamp 到下界，不报错", () => {
		const path = writeConfig(
			JSON.stringify({
				plan: { maxTasks: 0 },
				ui: { widget: { maxLines: 1 } },
				commands: { export: { enabled: false } },
			}),
		);
		const config = loadConfig({ configPath: path, env: {} });

		expect([config.plan.maxTasks, config.ui.widget.maxLines]).toEqual([1, 3]);
		expect(config.commands.export.enabled).toBe(false);
	});

	it("区间内的数值原样保留", () => {
		const path = writeConfig(
			JSON.stringify({
				plan: { maxTasks: 37 },
				ui: { widget: { maxLines: 4 } },
			}),
		);
		const config = loadConfig({ configPath: path, env: {} });

		expect([config.plan.maxTasks, config.ui.widget.maxLines]).toEqual([37, 4]);
	});

	it("configPath 优先于 $PI_CODING_AGENT_DIR", () => {
		const agentDir = writeAgentConfig(
			JSON.stringify({ plan: { maxTasks: 7 } }),
		);
		const path = writeConfig(JSON.stringify({ plan: { maxTasks: 9 } }));

		expect(
			loadConfig({ configPath: path, env: { PI_CODING_AGENT_DIR: agentDir } })
				.plan.maxTasks,
		).toBe(9);
	});

	it("$PI_CODING_AGENT_DIR 优先于 ~/.pi/agent", () => {
		const agentDir = writeAgentConfig(
			JSON.stringify({ plan: { maxTasks: 7 } }),
		);

		expect(
			loadConfig({ env: { PI_CODING_AGENT_DIR: agentDir } }).plan.maxTasks,
		).toBe(7);
	});

	it("$PI_CODING_AGENT_DIR 指向的目录没有配置文件时取默认值", () => {
		const agentDir = join(makeTempDir(), "agent");

		expect(loadConfig({ env: { PI_CODING_AGENT_DIR: agentDir } })).toEqual(
			DEFAULTS,
		);
	});
});
