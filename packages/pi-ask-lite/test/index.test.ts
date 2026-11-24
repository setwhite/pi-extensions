import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
	ExtensionAPI,
	ExtensionContext,
	Theme,
	ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { initTheme } from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";
import { afterEach, describe, expect, it, vi } from "vitest";
import piAsk from "../src/index.ts";

const dirs: string[] = [];

function useConfig(config?: unknown): void {
	const dir = mkdtempSync(join(tmpdir(), "pi-ask-index-"));
	dirs.push(dir);
	if (config !== undefined) {
		mkdirSync(join(dir, "pi-ask"), { recursive: true });
		writeFileSync(
			join(dir, "pi-ask", "config.json"),
			JSON.stringify(config),
			"utf-8",
		);
	}
	vi.stubEnv("PI_CODING_AGENT_DIR", dir);
}

afterEach(() => {
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
	for (const dir of dirs.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

type Event = { channel: string; data: unknown };
type Result = {
	content: { type: string; text: string }[];
	details: {
		answers: {
			index: number;
			question: string;
			selected: number[];
			custom?: string;
			note?: string;
		}[];
		skipped?: number[];
		aborted: boolean;
	};
	terminate?: boolean;
};
type Execute = (
	toolCallId: string,
	params: unknown,
	signal: unknown,
	onUpdate: unknown,
	ctx: ExtensionContext,
) => Promise<Result>;

function setup(): {
	tools: ToolDefinition[];
	events: Event[];
	execute: Execute;
} {
	const tools: ToolDefinition[] = [];
	const events: Event[] = [];
	const api = {
		registerTool: (definition: ToolDefinition) => tools.push(definition),
		events: {
			emit: (channel: string, data: unknown) => events.push({ channel, data }),
			on: () => () => undefined,
		},
	} as unknown as ExtensionAPI;
	piAsk(api);
	const tool = tools[0];
	return { tools, events, execute: tool.execute as unknown as Execute };
}

const FAKE_TUI = {
	terminal: { rows: 40, columns: 120 },
	requestRender: () => undefined,
} as unknown as TUI;

const FAKE_THEME = {
	fg: (_token: string, text: string) => text,
	style: (text: string, _options: unknown) => text,
	bold: (text: string) => text,
} as unknown as Theme;

type Controls = {
	component?: Component;
	settled: boolean;
	abort: ReturnType<typeof vi.fn>;
};

function makeCtx(mode: string, controls: Controls): ExtensionContext {
	return {
		mode,
		hasUI: true,
		abort: controls.abort,
		ui: {
			custom: (
				factory: (
					tui: TUI,
					theme: Theme,
					keybindings: unknown,
					done: (result: unknown) => void,
				) => Component,
			) =>
				new Promise((resolve, reject) => {
					try {
						controls.component = factory(FAKE_TUI, FAKE_THEME, {}, (result) => {
							controls.settled = true;
							resolve(result);
						});
					} catch (error) {
						reject(error);
					}
				}),
		},
	} as unknown as ExtensionContext;
}

function controls(): Controls {
	return { settled: false, abort: vi.fn() };
}

const params = {
	questions: [
		{
			question: "Which one?",
			options: [{ label: "Alpha" }, { label: "Beta" }],
		},
	],
};

const pairParams = {
	questions: [
		...params.questions,
		{
			question: "And the second?",
			options: [{ label: "Gamma" }, { label: "Delta" }],
		},
	],
};

describe("注册", () => {
	it("注册 ask 工具，model-only，guidance 占位换成工具名", () => {
		useConfig();
		const { tools } = setup();
		expect(tools).toHaveLength(1);
		const tool = tools[0];
		expect(tool.name).toBe("ask");
		expect(tool.exposure).toBe("model-only");
		expect(tool.description).not.toContain("tool-name");
		for (const guideline of tool.promptGuidelines ?? []) {
			expect(guideline).toMatch(/^ask: /);
			expect(guideline).not.toContain("tool-name");
		}
	});

	it("默认不注册 promptSnippet", () => {
		useConfig();
		const { tools } = setup();
		expect(tools[0].promptSnippet).toBeUndefined();
	});

	it("guidance.promptSnippet 非空时注册那一行", () => {
		useConfig({ guidance: { promptSnippet: "tool-name: Ask once." } });
		const { tools } = setup();
		expect(tools[0].promptSnippet).toBe("ask: Ask once.");
	});

	it("改名后注册名与 guidelines 前缀一起换", () => {
		useConfig({ tools: { ask: { name: "question" } } });
		const { tools } = setup();
		expect(tools[0].name).toBe("question");
		for (const guideline of tools[0].promptGuidelines ?? [])
			expect(guideline).toMatch(/^question: /);
	});
});

describe("无 UI", () => {
	it("mode 不是 tui 时抛错，不发事件，不挂组件", async () => {
		useConfig();
		const { execute, events } = setup();
		const state = controls();
		await expect(
			execute("call", params, undefined, undefined, makeCtx("rpc", state)),
		).rejects.toThrow(/needs the interactive TUI/);
		expect(events).toEqual([]);
		expect(state.component).toBeUndefined();
	});
});

describe("提交", () => {
	it("数字键选中后返回结果，herdr 事件成对，不中止本轮", async () => {
		useConfig();
		const { execute, events } = setup();
		const state = controls();
		const pending = execute(
			"call",
			params,
			undefined,
			undefined,
			makeCtx("tui", state),
		);
		state.component?.handleInput?.("2");
		const result = await pending;

		expect(result.terminate).toBeUndefined();
		expect(result.details).toEqual({
			answers: [{ index: 0, question: "Which one?", selected: [1] }],
			aborted: false,
		});
		expect(result.content[0].text).toContain("Which one? => Beta");
		expect(events).toEqual([
			{ channel: "herdr:blocked", data: { active: true, label: "ask" } },
			{ channel: "herdr:blocked", data: { active: false, label: "ask" } },
		]);
		expect(state.abort).not.toHaveBeenCalled();
	});

	it("note 编辑走 Input：e、输入、回车", async () => {
		useConfig();
		const { execute } = setup();
		const state = controls();
		const pending = execute(
			"call",
			params,
			undefined,
			undefined,
			makeCtx("tui", state),
		);
		state.component?.handleInput?.("e");
		state.component?.handleInput?.("选 Beta");
		state.component?.handleInput?.("\r");
		const result = await pending;
		expect(result.details.answers[0]).toMatchObject({
			selected: [0],
			note: "选 Beta",
		});
	});

	it("keys.annotate 换成 n 后，n 打开补充说明", async () => {
		useConfig({ keys: { annotate: "n" } });
		const { execute } = setup();
		const state = controls();
		const pending = execute(
			"call",
			params,
			undefined,
			undefined,
			makeCtx("tui", state),
		);
		state.component?.handleInput?.("n");
		state.component?.handleInput?.("why");
		state.component?.handleInput?.("\r");
		const result = await pending;
		expect(result.details.answers[0]).toMatchObject({ note: "why" });
	});

	it("自由输入走 Editor：移到 Custom 行直接敲字", async () => {
		useConfig();
		const { execute } = setup();
		const state = controls();
		const pending = execute(
			"call",
			params,
			undefined,
			undefined,
			makeCtx("tui", state),
		);
		state.component?.handleInput?.("\x1b[B");
		state.component?.handleInput?.("\x1b[B");
		state.component?.handleInput?.("h");
		state.component?.handleInput?.("i");
		state.component?.handleInput?.("\r");
		const result = await pending;
		expect(result.details.answers[0]).toMatchObject({ custom: "hi" });
	});
});

describe("中止", () => {
	it("Esc 返回 terminate、清空答案，并调 ctx.abort", async () => {
		useConfig();
		const { execute, events } = setup();
		const state = controls();
		const pending = execute(
			"call",
			pairParams,
			undefined,
			undefined,
			makeCtx("tui", state),
		);
		state.component?.handleInput?.("1");
		state.component?.handleInput?.("\x1b");
		const result = await pending;

		expect(result.terminate).toBe(true);
		expect(result.details).toEqual({ answers: [], aborted: true });
		expect(result.content[0].text).toMatch(/aborted/i);
		expect(state.abort).toHaveBeenCalledTimes(1);
		expect(
			events.map((event) => (event.data as { active: boolean }).active),
		).toEqual([true, false]);
	});

	it("编辑态 Esc 只退编辑，对话框还开着", async () => {
		useConfig();
		const { execute } = setup();
		const state = controls();
		const pending = execute(
			"call",
			params,
			undefined,
			undefined,
			makeCtx("tui", state),
		);
		state.component?.handleInput?.("e");
		state.component?.handleInput?.("a");
		state.component?.handleInput?.("\x1b");
		expect(state.settled).toBe(false);
		state.component?.handleInput?.("\x1b");
		const result = await pending;
		expect(result.details.aborted).toBe(true);
	});

	it("组件抛错时 herdr 事件也要成对发出", async () => {
		useConfig();
		const { execute, events } = setup();
		const ctx = {
			mode: "tui",
			hasUI: true,
			abort: vi.fn(),
			ui: { custom: () => Promise.reject(new Error("boom")) },
		} as unknown as ExtensionContext;
		await expect(
			execute("call", params, undefined, undefined, ctx),
		).rejects.toThrow("boom");
		expect(
			events.map((event) => (event.data as { active: boolean }).active),
		).toEqual([true, false]);
	});
});

describe("渲染与铃", () => {
	it("带 preview 的题能渲染出并排列", async () => {
		initTheme();
		useConfig();
		const { execute } = setup();
		const state = controls();
		const previewParams = {
			questions: [
				{
					question: "Pick",
					options: [{ label: "A", preview: "# Title" }, { label: "B" }],
				},
			],
		};
		void execute(
			"call",
			previewParams,
			undefined,
			undefined,
			makeCtx("tui", state),
		);
		const lines = state.component?.render(120) ?? [];
		expect(
			lines.some((line) => line.includes("│") && line.includes("Title")),
		).toBe(true);
	});

	it("ui.bell 为真时提交响铃，关闭后不响", async () => {
		useConfig();
		const write = vi
			.spyOn(process.stdout, "write")
			.mockImplementation(() => true);
		const first = setup();
		const firstState = controls();
		const pending = first.execute(
			"call",
			params,
			undefined,
			undefined,
			makeCtx("tui", firstState),
		);
		firstState.component?.handleInput?.("1");
		await pending;
		expect(
			write.mock.calls.some((call) => String(call[0]).includes("\x07")),
		).toBe(true);

		write.mockClear();
		useConfig({ ui: { bell: false } });
		const second = setup();
		const secondState = controls();
		const quiet = second.execute(
			"call",
			params,
			undefined,
			undefined,
			makeCtx("tui", secondState),
		);
		secondState.component?.handleInput?.("1");
		await quiet;
		expect(
			write.mock.calls.some((call) => String(call[0]).includes("\x07")),
		).toBe(false);
	});
});
