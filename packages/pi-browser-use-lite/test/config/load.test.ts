import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect, it } from "vitest";
import {
	configPath,
	DEFAULTS,
	loadConfig,
	type ResolvedConfig,
	TOOL_IDS,
} from "../../src/config/index.ts";

const CONFIG_FILE = join("pi-browser-use-lite", "config.json");

function withAgentDir<T>(
	text: string | undefined,
	read: (agentDir: string) => T,
): T {
	const agentDir = mkdtempSync(join(tmpdir(), "pi-browser-config-"));
	if (text !== undefined) {
		const target = join(agentDir, CONFIG_FILE);
		mkdirSync(dirname(target), { recursive: true });
		writeFileSync(target, text);
	}
	try {
		return read(agentDir);
	} finally {
		rmSync(agentDir, { recursive: true, force: true });
	}
}

function readConfig(value: unknown): ResolvedConfig {
	return withAgentDir(JSON.stringify(value), (agentDir) =>
		loadConfig(agentDir),
	);
}

it("AC2: 文件缺失时 13 个标量取默认值，工具全开且保留原名", () => {
	let root = "";
	const config = withAgentDir(undefined, (agentDir) => {
		root = agentDir;
		return loadConfig(agentDir);
	});
	expect(config).toStrictEqual({
		...DEFAULTS,
		screenshot: {
			...DEFAULTS.screenshot,
			dir: join(root, "pi-browser-use-lite", "screenshots"),
		},
		tools: {
			chrome_act: { enabled: true, name: "chrome_act" },
			chrome_see: { enabled: true, name: "chrome_see" },
			chrome_tab: { enabled: true, name: "chrome_tab" },
			chrome_vision: { enabled: true, name: "chrome_vision" },
			chrome_cdp: { enabled: true, name: "chrome_cdp" },
		},
		guidance: {},
	});
	expect(config.bridge.port).toBe(17_318);
	expect(config.screenshot.dir).toBe(
		join(root, "pi-browser-use-lite", "screenshots"),
	);
	expect(config.screenshot.format).toBe("png");
	for (const id of TOOL_IDS) {
		expect(config.tools[id]).toStrictEqual({ enabled: true, name: id });
	}
});

it("AC2: 13 个标量逐项等于 schema 默认值", () => {
	let root = "";
	const config = withAgentDir(JSON.stringify({}), (agentDir) => {
		root = agentDir;
		return loadConfig(agentDir);
	});
	expect({
		bridge: config.bridge.port,
		authorizeOnStart: config.policy.authorizeOnStart,
		background: config.policy.background,
		closeOwnTabsOnExit: config.policy.closeOwnTabsOnExit,
		dragSteps: config.input.dragSteps,
		scrollSteps: config.input.scrollSteps,
		navigateTimeoutMs: config.timing.navigateTimeoutMs,
		maxElements: config.output.maxElements,
		textChars: config.output.textChars,
		dir: config.screenshot.dir,
		format: config.screenshot.format,
		keepNewest: config.screenshot.keepNewest,
		guidelines: config.prompt.guidelines,
	}).toStrictEqual({
		bridge: DEFAULTS.bridge.port,
		authorizeOnStart: DEFAULTS.policy.authorizeOnStart,
		background: DEFAULTS.policy.background,
		closeOwnTabsOnExit: DEFAULTS.policy.closeOwnTabsOnExit,
		dragSteps: DEFAULTS.input.dragSteps,
		scrollSteps: DEFAULTS.input.scrollSteps,
		navigateTimeoutMs: DEFAULTS.timing.navigateTimeoutMs,
		maxElements: DEFAULTS.output.maxElements,
		textChars: DEFAULTS.output.textChars,
		dir: join(root, "pi-browser-use-lite", "screenshots"),
		format: DEFAULTS.screenshot.format,
		keepNewest: DEFAULTS.screenshot.keepNewest,
		guidelines: DEFAULTS.prompt.guidelines,
	});
});

it("AC4: port 越界 clamp 到 65535，合法值保留", () => {
	expect(readConfig({ bridge: { port: 99_999 } }).bridge.port).toBe(65_535);
	expect(readConfig({ bridge: { port: 8_080 } }).bridge.port).toBe(8_080);
	expect(readConfig({ bridge: { port: 0 } }).bridge.port).toBe(1);
});

it("AC5: 非法 screenshot.format 回退默认值，合法值保留", () => {
	expect(readConfig({ screenshot: { format: "webp" } }).screenshot.format).toBe(
		"png",
	);
	expect(readConfig({ screenshot: { format: "jpeg" } }).screenshot.format).toBe(
		"jpeg",
	);
});

it("非字符串的 screenshot.format 是类型错误，抛错并带字段路径", () => {
	expect(() => readConfig({ screenshot: { format: 5 } })).toThrowError(
		"screenshot.format",
	);
});

it("未启用的工具也参与同名检查", () => {
	expect(() =>
		readConfig({
			tools: { chrome_cdp: { enabled: false, name: "chrome_act" } },
		}),
	).toThrowError("same name");
});

it("AC6: 5 个工具全关时抛错，消息含 tools", () => {
	const tools = Object.fromEntries(
		TOOL_IDS.map((id) => [id, { enabled: false }]),
	);
	expect(() => readConfig({ tools })).toThrowError("tools");
});

it("AC7: 名称不合规时抛错，消息含 tools.chrome_act.name", () => {
	expect(() =>
		readConfig({ tools: { chrome_act: { name: "Bash" } } }),
	).toThrowError("tools.chrome_act.name");
});

it("AC8: 占用宿主内置名时抛错，消息含 reserved", () => {
	expect(() =>
		readConfig({ tools: { chrome_act: { name: "read" } } }),
	).toThrowError("reserved");
});

it("AC9: 两个工具同名时抛错，消息含 same name", () => {
	expect(() =>
		readConfig({ tools: { chrome_act: { name: "chrome_see" } } }),
	).toThrowError("same name");
});

it("AC10: guidance 未知字段抛错，消息含 guidance.chrome_act.desc", () => {
	expect(() =>
		readConfig({ guidance: { chrome_act: { desc: "x" } } }),
	).toThrowError("guidance.chrome_act.desc");
});

it("AC11: guidance 显式清空自己的规则，其余工具保持内置", () => {
	const config = readConfig({
		guidance: { chrome_act: { promptGuidelines: [] } },
	});
	expect(config.guidance.chrome_act?.promptGuidelines).toStrictEqual([]);
	expect(config.guidance.chrome_see).toBeUndefined();
});

it("AC12: prompt.guidelines 空数组原样保留", () => {
	expect(
		readConfig({ prompt: { guidelines: [] } }).prompt.guidelines,
	).toStrictEqual([]);
});

it("AC13: prompt 未知字段抛错，消息含 prompt.guideline", () => {
	expect(() => readConfig({ prompt: { guideline: ["a"] } })).toThrowError(
		"prompt.guideline",
	);
});

it("AC14: screenshot 未知字段抛错，消息含 screenshot.retentionDays", () => {
	expect(() => readConfig({ screenshot: { retentionDays: 7 } })).toThrowError(
		"screenshot.retentionDays",
	);
});

it("AC3: JSON 损坏时抛错，消息含文件路径", () => {
	withAgentDir("{oops", (agentDir) => {
		const expected = join(agentDir, CONFIG_FILE);
		expect(() => loadConfig(agentDir)).toThrowError(expected);
	});
});

it("AC15: configPath 以 PI_CODING_AGENT_DIR 开头，未设时以 ~/.pi/agent 开头", () => {
	const envDir = join(tmpdir(), "pi-browser-agent");
	const path = configPath({ PI_CODING_AGENT_DIR: envDir });
	expect(path.startsWith(envDir)).toBe(true);
	expect(path.endsWith(CONFIG_FILE)).toBe(true);

	const fallback = configPath({});
	expect(fallback.startsWith(join(homedir(), ".pi", "agent"))).toBe(true);
});

it("AC15: configPath 默认读 process.env", () => {
	const saved = process.env.PI_CODING_AGENT_DIR;
	process.env.PI_CODING_AGENT_DIR = join(tmpdir(), "pi-browser-env");
	try {
		expect(configPath()).toBe(
			join(process.env.PI_CODING_AGENT_DIR, CONFIG_FILE),
		);
	} finally {
		if (saved === undefined) {
			delete process.env.PI_CODING_AGENT_DIR;
		} else {
			process.env.PI_CODING_AGENT_DIR = saved;
		}
	}
});
