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
import {
	type Component,
	stripTerminalSequences,
	type TUI,
} from "@earendil-works/pi-tui";
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
			notes?: Record<string, string>;
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

describe("折叠", () => {
	it("ctrl+] 折叠成一行，再按恢复，答案与焦点都在", async () => {
		useConfig();
		const { execute } = setup();
		const state = controls();
		const pending = execute(
			"call",
			pairParams,
			undefined,
			undefined,
			makeCtx("tui", state),
		);
		const expand = state.component?.render(80) ?? [];
		const toggle = () => state.component?.handleInput?.("\x1d");
		toggle();
		const collapsed = state.component?.render(80) ?? [];
		expect(collapsed).toHaveLength(1);
		expect(collapsed[0]).toContain("Ask collapsed (0/2)");
		expect(collapsed[0]).toContain("ctrl+] expand");
		toggle();
		expect(state.component?.render(80)).toEqual(expand);

		state.component?.handleInput?.("1");
		state.component?.handleInput?.("\x1b");
		await pending;
	});

	it("collapse 配成 off 时 ctrl+] 不折叠", async () => {
		useConfig({ keys: { collapse: "off" } });
		const { execute } = setup();
		const state = controls();
		void execute("call", params, undefined, undefined, makeCtx("tui", state));
		const before = state.component?.render(80) ?? [];
		state.component?.handleInput?.("\x1d");
		expect(state.component?.render(80)).toEqual(before);
	});
});

describe("多选", () => {
	it("Enter 只勾选，走到 Confirm 行按 Enter 才收题", async () => {
		useConfig();
		const { execute } = setup();
		const state = controls();
		const multi = {
			questions: [
				{
					question: "Pick many",
					multiple: true,
					options: [{ label: "A" }, { label: "B" }],
				},
			],
		};
		const pending = execute(
			"call",
			multi,
			undefined,
			undefined,
			makeCtx("tui", state),
		);
		const input = (data: string) => state.component?.handleInput?.(data);
		input("\r");
		input(" ");
		input("\x1b[B");
		input("\r");
		input("\x1b[B");
		input("\x1b[B");
		expect(state.settled).toBe(false);
		input("\r");
		const result = await pending;
		expect(result.details.answers[0]).toMatchObject({ selected: [0, 1] });
	});

	it("e 给单个选项写 note：Enter 保存并自动勾选，焦点留在列表", async () => {
		useConfig();
		const { execute } = setup();
		const state = controls();
		const multi = {
			questions: [
				{
					question: "Pick many",
					multiple: true,
					options: [{ label: "A" }, { label: "B" }],
				},
			],
		};
		const pending = execute(
			"call",
			multi,
			undefined,
			undefined,
			makeCtx("tui", state),
		);
		const input = (data: string) => state.component?.handleInput?.(data);
		input("e");
		input("A 的理由");
		input("\r");
		expect(state.settled).toBe(false);
		input("\x1b[B");
		input("e");
		input("B 的理由");
		input("\r");
		input("\x1b[B");
		input("\x1b[B");
		input("\r");
		const result = await pending;
		expect(result.details.answers[0]).toMatchObject({
			selected: [0, 1],
			notes: { "0": "A 的理由", "1": "B 的理由" },
		});
	});

	it("Space 不再切换勾选", async () => {
		useConfig();
		const { execute } = setup();
		const state = controls();
		const multi = {
			questions: [
				{
					question: "Pick many",
					multiple: true,
					options: [{ label: "A" }, { label: "B" }],
				},
			],
		};
		void execute("call", multi, undefined, undefined, makeCtx("tui", state));
		state.component?.handleInput?.(" ");
		const lines = state.component?.render(80) ?? [];
		expect(lines.join("\n")).not.toContain("■");
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

type ToolRenderers = {
	renderCall?: (args: unknown, theme: Theme, context: unknown) => Component;
	renderResult?: (
		result: unknown,
		options: unknown,
		theme: Theme,
		context: unknown,
	) => Component;
};

describe("聊天记录", () => {
	const theme = {
		fg: (token: string, text: string) =>
			token === "muted" ? `\x1b[2m${text}\x1b[22m` : text,
		bold: (text: string) => text,
		style: (text: string) => text,
	} as unknown as Theme;
	const lines = (component: Component) =>
		component.render(80).map((line) => stripTerminalSequences(line).trimEnd());

	function renderers(): ToolRenderers {
		useConfig();
		return setup().tools[0] as unknown as ToolRenderers;
	}

	it("调用行只显示 Ask 与题目标签", () => {
		const { renderCall } = renderers();
		const component = renderCall?.(
			{
				questions: [
					{ title: "风格", question: "Which one?", options: [] },
					{ question: "细节？\n第二行", options: [] },
				],
			},
			theme,
			{},
		);
		expect(lines(component as Component)).toEqual(["Ask 风格 · 细节？"]);
	});

	it("结果每题一行，跳过项 dim", () => {
		const { renderResult } = renderers();
		const component = renderResult?.(
			{
				content: [],
				details: {
					aborted: false,
					answers: [{ index: 0, question: "Q", selected: [1] }],
					skipped: [1],
				},
			},
			{},
			theme,
			{
				args: {
					questions: [
						{
							title: "风格",
							question: "Which one?",
							options: [{ label: "A" }, { label: "B" }],
						},
						{ title: "细节", question: "Second", options: [{ label: "C" }] },
					],
				},
			},
		);
		const rendered = (component as Component).render(80);
		expect(
			rendered.map((line) => stripTerminalSequences(line).trimEnd()),
		).toEqual(["✓ 风格: B", "细节: skipped"]);
		expect(rendered[1]).toContain("\x1b[2m");
	});

	it("展开态按题列出完整题干与选项 note", () => {
		const { renderResult } = renderers();
		const component = renderResult?.(
			{
				content: [],
				details: {
					aborted: false,
					answers: [
						{
							index: 0,
							question: "First\nsecond",
							selected: [0, 1],
							notes: { "0": "理由 A" },
						},
					],
					skipped: [1],
				},
			},
			{ expanded: true },
			theme,
			{
				args: {
					questions: [
						{
							title: "One",
							question: "First\nsecond",
							options: [{ label: "A" }, { label: "B" }],
						},
						{
							title: "Two",
							question: "Second question",
							options: [{ label: "C" }],
						},
					],
				},
			},
		);
		expect(lines(component as Component)).toEqual([
			"✓ One",
			"  First",
			"  second",
			"  - A (note: 理由 A)",
			"  - B",
			"Two: skipped",
			"  Second question",
		]);
	});

	it("中止只显示 dim 的 ✗ aborted", () => {
		const { renderResult } = renderers();
		const component = renderResult?.(
			{ content: [], details: { aborted: true, answers: [] } },
			{},
			theme,
			{ args: { questions: [] } },
		);
		const rendered = (component as Component).render(80);
		expect(
			rendered.map((line) => stripTerminalSequences(line).trimEnd()),
		).toEqual(["✗ aborted"]);
		expect(rendered[0]).toContain("\x1b[2m");
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

	it("ui.bell 为真时挂载响一次，提交与中止都不再响", async () => {
		useConfig();
		const write = vi
			.spyOn(process.stdout, "write")
			.mockImplementation(() => true);
		const bells = () =>
			write.mock.calls.filter((call) => String(call[0]).includes("\x07"))
				.length;

		const first = setup();
		const firstState = controls();
		const pending = first.execute(
			"call",
			params,
			undefined,
			undefined,
			makeCtx("tui", firstState),
		);
		expect(bells()).toBe(1);
		firstState.component?.handleInput?.("1");
		await pending;
		expect(bells()).toBe(1);

		write.mockClear();
		const second = setup();
		const secondState = controls();
		const aborted = second.execute(
			"call",
			params,
			undefined,
			undefined,
			makeCtx("tui", secondState),
		);
		expect(bells()).toBe(1);
		secondState.component?.handleInput?.("\x1b");
		await aborted;
		expect(bells()).toBe(1);

		write.mockClear();
		useConfig({ ui: { bell: false } });
		const quiet = setup();
		const quietState = controls();
		const silent = quiet.execute(
			"call",
			params,
			undefined,
			undefined,
			makeCtx("tui", quietState),
		);
		expect(bells()).toBe(0);
		quietState.component?.handleInput?.("1");
		await silent;
		expect(bells()).toBe(0);
	});
});
