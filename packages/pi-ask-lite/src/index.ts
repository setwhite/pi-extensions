import {
	type ExtensionAPI,
	getMarkdownTheme,
	type Theme,
} from "@earendil-works/pi-coding-agent";
import {
	type Component,
	Editor,
	Input,
	type KeyId,
	Markdown,
	matchesKey,
	stripTerminalSequences,
	type TUI,
	truncateToWidth,
	visibleWidth,
} from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { type Config, loadConfig } from "./config.ts";
import { parseAskInput, type Question } from "./schema.ts";
import {
	type Action,
	createSession,
	type Outcome,
	reduce,
	type Session,
} from "./state.ts";
import { type PanelStyle, renderPanel, summarize } from "./view.ts";

const PLACEHOLDER = "tool-name";
const ELLIPSIS = "…";

const ASK_PARAMETERS = Type.Object(
	{
		questions: Type.Array(
			Type.Object(
				{
					title: Type.Optional(
						Type.String({ description: "Short label for the question tab." }),
					),
					question: Type.String({ description: "The question to ask." }),
					multiple: Type.Optional(
						Type.Boolean({ description: "Allow more than one selection." }),
					),
					options: Type.Array(
						Type.Object(
							{
								label: Type.String({ description: "Option label." }),
								detail: Type.Optional(
									Type.String({
										description: "One line of context under the label.",
									}),
								),
								preview: Type.Optional(
									Type.String({
										description: "Markdown shown beside the option.",
									}),
								),
							},
							{ additionalProperties: false },
						),
					),
				},
				{ additionalProperties: false },
			),
		),
	},
	{ additionalProperties: false },
);

const SELECT_LIST_THEME = {
	selectedPrefix: (text: string) => text,
	selectedText: (text: string) => text,
	description: (text: string) => text,
	scrollInfo: (text: string) => text,
	noMatch: (text: string) => text,
};

export default function piAsk(pi: ExtensionAPI): void {
	const config = loadConfig();
	const toolName = config.tools.ask.name;
	const guidance = (text: string) => text.replaceAll(PLACEHOLDER, toolName);

	pi.registerTool({
		name: toolName,
		label: "Ask",
		description: guidance(config.guidance.description),
		promptSnippet:
			config.guidance.promptSnippet === ""
				? undefined
				: guidance(config.guidance.promptSnippet),
		promptGuidelines: config.guidance.promptGuidelines.map(guidance),
		parameters: ASK_PARAMETERS,
		exposure: "model-only",
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
			const questions = parseAskInput(params, config.limits);
			if (ctx.mode !== "tui" || typeof ctx.ui?.custom !== "function") {
				throw new Error(
					`${toolName} needs the interactive TUI. Do not retry it in this session.`,
				);
			}

			pi.events.emit("herdr:blocked", { active: true, label: toolName });
			try {
				const outcome = await ctx.ui.custom<Outcome>(
					(tui, theme, _keybindings, done) =>
						new AskComponent(questions, config, tui, theme, done),
				);
				if (outcome.kind === "abort") {
					ctx.abort();
					return {
						content: [
							{ type: "text" as const, text: summarize(outcome, questions) },
						],
						details: { answers: [], aborted: true },
						terminate: true,
					};
				}
				return {
					content: [
						{ type: "text" as const, text: summarize(outcome, questions) },
					],
					details: {
						answers: outcome.answers,
						...(outcome.skipped.length > 0 ? { skipped: outcome.skipped } : {}),
						aborted: false,
					},
				};
			} finally {
				pi.events.emit("herdr:blocked", { active: false, label: toolName });
			}
		},
	});
}

class AskComponent implements Component {
	private session: Session;
	private finished = false;
	private input: Input | undefined;
	private editor: Editor | undefined;
	private readonly config: Config;
	private readonly tui: TUI;
	private readonly theme: Theme;
	private readonly done: (result: Outcome) => void;

	constructor(
		questions: Question[],
		config: Config,
		tui: TUI,
		theme: Theme,
		done: (result: Outcome) => void,
	) {
		this.session = createSession(questions);
		this.config = config;
		this.tui = tui;
		this.theme = theme;
		this.done = done;
	}

	invalidate(): void {
		this.input?.invalidate();
		this.editor?.invalidate();
	}

	render(width: number): string[] {
		const rows = this.tui.terminal?.rows ?? 24;
		const height = Math.max(
			6,
			Math.floor(rows * this.config.ui.maxHeightRatio),
		);
		const editorLines = this.editorLines(width);
		return renderPanel(
			this.session,
			{
				width,
				height,
				keys: this.config.keys,
				minSideBySideWidth: this.config.ui.preview.minSideBySideWidth,
				...(editorLines === undefined ? {} : { editorLines }),
			},
			this.panelStyle(),
		);
	}

	handleInput(data: string): void {
		if (this.input !== undefined) {
			if (matches(data, "escape")) {
				this.dispatch({ kind: "cancelNote", text: this.input.getValue() });
				return;
			}
			this.input.focused = true;
			this.input.handleInput(data);
			return;
		}
		if (this.editor !== undefined) {
			if (matches(data, "escape")) {
				this.dispatch({ kind: "cancelCustom", text: this.editor.getText() });
				return;
			}
			this.editor.focused = true;
			this.editor.handleInput(data);
			return;
		}
		this.handleListInput(data);
	}

	private handleListInput(data: string): void {
		const fixed: Array<[string, Action]> = [
			["escape", { kind: "escape" }],
			["up", { kind: "up" }],
			["down", { kind: "down" }],
			["tab", { kind: "nextQuestion" }],
			["shift+tab", { kind: "prevQuestion" }],
			["left", { kind: "prevQuestion" }],
			["right", { kind: "nextQuestion" }],
			["space", { kind: "toggle" }],
			["enter", { kind: "confirm" }],
		];
		for (const [key, action] of fixed) {
			if (!matches(data, key)) continue;
			this.dispatch(action);
			return;
		}
		const digit = /^[1-9]$/.exec(data);
		if (digit !== null) {
			this.dispatch({ kind: "digit", value: Number(digit[0]) });
			return;
		}
		if (this.session.focus.kind === "custom" && isPrintable(data)) {
			this.dispatch({ kind: "confirm" });
			this.editor?.insertTextAtCursor(data);
			return;
		}
		if (matches(data, this.config.keys.submitEarly)) {
			this.dispatch({ kind: "submitEarly" });
			return;
		}
		if (matches(data, this.config.keys.annotate)) {
			this.dispatch({ kind: "annotate" });
		}
	}

	private dispatch(action: Action): void {
		this.session = reduce(this.session, action);
		this.syncEditors();
		if (this.session.phase.kind === "done")
			this.finish(this.session.phase.outcome);
	}

	private finish(outcome: Outcome): void {
		if (this.finished) return;
		this.finished = true;
		if (this.config.ui.bell) {
			try {
				process.stdout.write("\x07");
			} catch {
				// 响铃失败不影响结果
			}
		}
		this.done(outcome);
	}

	private syncEditors(): void {
		const phase = this.session.phase;
		if (phase.kind === "note") {
			if (this.input === undefined) {
				const input = new Input({ prompt: "  " });
				input.setValue(phase.initial);
				input.onSubmit = (value: string) =>
					this.dispatch({ kind: "commitNote", text: value });
				input.onEscape = () =>
					this.dispatch({ kind: "cancelNote", text: input.getValue() });
				this.input = input;
			}
			this.editor = undefined;
			return;
		}
		if (phase.kind === "custom") {
			if (this.editor === undefined) {
				const editor = new Editor(this.tui, {
					borderColor: (text: string) => this.theme.style(text, { dim: true }),
					selectList: SELECT_LIST_THEME,
				});
				editor.setText(phase.initial);
				editor.onSubmit = (text: string) =>
					this.dispatch({ kind: "commitCustom", text });
				this.editor = editor;
			}
			this.input = undefined;
			return;
		}
		this.input = undefined;
		this.editor = undefined;
	}

	private editorLines(width: number): string[] | undefined {
		if (this.input !== undefined) {
			this.input.focused = true;
			return this.input.render(width);
		}
		if (this.editor !== undefined) {
			this.editor.focused = true;
			return this.editor.render(width);
		}
		return undefined;
	}

	private panelStyle(): PanelStyle {
		return {
			accent: (text) => this.theme.fg("accent", text),
			muted: (text) => this.theme.style(text, { dim: true }),
			bold: (text) => this.theme.bold(text),
			width: visibleWidth,
			truncate: (text, width) =>
				stripTerminalSequences(truncateToWidth(text, width, ELLIPSIS)),
			markdown: (text, width) =>
				new Markdown(text, 0, 0, getMarkdownTheme()).render(width),
		};
	}
}

function matches(data: string, key: string): boolean {
	try {
		return matchesKey(data, key as KeyId);
	} catch {
		return false;
	}
}

function isPrintable(data: string): boolean {
	return data.length === 1 && data >= " " && data !== "\x7f";
}
