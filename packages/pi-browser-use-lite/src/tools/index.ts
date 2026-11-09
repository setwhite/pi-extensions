/**
 * 工具面：5 个分派器式工具的默认定义，以及按配置裁剪出的最终工具面。
 * 工具名不在此处复制自 config：名字与开关由调用方传入，见 buildSurface。
 * 执行器在 exec/ 里按 id 分派；本模块只拥有对模型可见的文本与参数 schema。
 */

import { type TSchema, Type } from "typebox";

/** `chrome_act` 的 action 取值，顺序按 SPEC-0001 的表。 */
export const ACT_ACTIONS = [
	"navigate",
	"click",
	"type",
	"fill",
	"press",
	"hover",
	"drag",
	"scroll",
	"upload",
	"eval",
	"wait",
	"batch",
] as const;

/** `chrome_see` 的 mode 取值。`refs` 是默认值，也是省 token 的主要手段。 */
export const SEE_MODES = ["refs", "text", "changes", "full"] as const;

/** `chrome_tab` 的 action 取值。 */
export const TAB_ACTIONS = ["list", "new", "switch", "close"] as const;

/** `chrome_act` 的 `wait` 的等待对象。 */
export const WAIT_KINDS = ["selector", "expression", "text"] as const;

/** 公共参数 `tab`：标签页 id、URL 子串或标题子串。 */
function tabParam(): TSchema {
	return Type.Optional(
		Type.String({
			description:
				"Tab id, URL substring or title substring; omit for this session's target.",
		}),
	);
}

export interface ToolSpec {
	label: string;
	description: string;
	parameters: TSchema;
	promptGuidelines: string[];
}

/**
 * 5 个工具的默认定义。键是工具 id，顺序即注册顺序（SPEC-0001 的表序）。
 * id 在 config 与本文件各写一份是依赖方向的必然：config/ 是叶子，tools/ 不能 import 它。
 */
export const TOOL_SPECS = {
	chrome_act: {
		label: "Chrome act",
		description:
			"Drive the user's real browser; one dispatcher for every interaction, from navigate to batch.",
		parameters: Type.Object({
			action: Type.Enum(ACT_ACTIONS),
			tab: tabParam(),
			see: Type.Optional(
				Type.Enum(SEE_MODES, {
					description:
						"Append a snapshot after the action; changes is the cheapest mode.",
				}),
			),
			url: Type.Optional(Type.String({ description: "Absolute http(s) URL." })),
			init_script: Type.Optional(Type.String()),
			ref: Type.Optional(Type.String()),
			selector: Type.Optional(Type.String()),
			x: Type.Optional(
				Type.Number({
					description: "Viewport x in CSS pixels.",
				}),
			),
			y: Type.Optional(
				Type.Number({
					description: "Viewport y in CSS pixels.",
				}),
			),
			text: Type.Optional(Type.String()),
			replace: Type.Optional(
				Type.Boolean({
					description: "Clear the field before typing.",
				}),
			),
			press: Type.Optional(
				Type.String({
					description: "Key to send after typing.",
				}),
			),
			key: Type.Optional(
				Type.String({
					description: "Key to press on its own.",
				}),
			),
			fields: Type.Optional(
				Type.Array(
					Type.Object({
						ref: Type.Optional(Type.String()),
						selector: Type.Optional(Type.String()),
						value: Type.String({
							description: "Value to store; it replaces the current content.",
						}),
					}),
				),
			),
			from_ref: Type.Optional(Type.String()),
			from_selector: Type.Optional(Type.String()),
			from_x: Type.Optional(Type.Number()),
			from_y: Type.Optional(Type.Number()),
			to_ref: Type.Optional(Type.String()),
			to_selector: Type.Optional(Type.String()),
			to_x: Type.Optional(Type.Number()),
			to_y: Type.Optional(Type.Number()),
			dy: Type.Optional(
				Type.Number({
					description:
						"Vertical scroll delta in CSS pixels; positive scrolls down.",
				}),
			),
			dx: Type.Optional(
				Type.Number({
					description:
						"Horizontal scroll delta in CSS pixels; positive scrolls right.",
				}),
			),
			paths: Type.Optional(
				Type.Array(Type.String(), {
					description: "Absolute paths; the next file chooser receives them.",
				}),
			),
			js: Type.Optional(
				Type.String({
					description:
						"JavaScript to evaluate in the page; awaited, so it may return a promise.",
				}),
			),
			kind: Type.Optional(Type.Enum(WAIT_KINDS)),
			value: Type.Optional(Type.String()),
			timeout_ms: Type.Optional(
				Type.Number({
					description: "Wait timeout in milliseconds; default 15000.",
				}),
			),
			steps: Type.Optional(
				Type.Array(
					Type.Object({
						action: Type.Enum(ACT_ACTIONS),
						optional: Type.Optional(
							Type.Boolean({
								description: "Keep going after this step fails.",
							}),
						),
						args: Type.Optional(
							Type.Unknown({
								description: "Arguments, named like a top-level call.",
							}),
						),
					}),
					{
						description:
							"Steps to run in order, at most 50; a failure stops the batch unless optional.",
					},
				),
			),
		}),
		promptGuidelines: [
			"this is the user's real browser; confirm before destructive actions.",
			"prefer refs from a snapshot; a ref from an older page fails.",
			"pass see to get a snapshot back; it costs tokens, so ask only when the page just changed.",
		],
	},
	chrome_see: {
		label: "Chrome see",
		description:
			"Read the page; refs is the cheapest mode, changes is the last diff, logs is console or network records.",
		parameters: Type.Object({
			mode: Type.Optional(
				Type.Enum(SEE_MODES, {
					description: "What to return; refs is the default.",
				}),
			),
			query: Type.Optional(
				Type.String({
					description:
						"What you are looking for, in natural language; returns refs.",
				}),
			),
			ref: Type.Optional(
				Type.String({ description: "Ref to inspect in depth." }),
			),
			selector: Type.Optional(Type.String()),
			logs: Type.Optional(Type.Enum(["console", "network"] as const)),
			request_id: Type.Optional(
				Type.String({
					description:
						"Id of one network request; returns its full record with bodies.",
				}),
			),
			clear: Type.Optional(
				Type.Boolean({
					description: "Empty the log after reading it.",
				}),
			),
			tab: tabParam(),
		}),
		promptGuidelines: [
			"read before you act; refs is cheaper than text.",
			"mode changes answers what moved; do not re-read the whole page.",
		],
	},
	chrome_tab: {
		label: "Chrome tab",
		description:
			"Manage the tabs of this session's own browser window; list, new, switch or close.",
		parameters: Type.Object({
			action: Type.Enum(TAB_ACTIONS),
			tab: Type.Optional(
				Type.String({
					description: "Tab id, URL substring or title substring.",
				}),
			),
			url: Type.Optional(
				Type.String({
					description: "Absolute http(s) URL; omit it to open a blank tab.",
				}),
			),
		}),
		promptGuidelines: [
			"do not switch or close tabs the user did not name.",
			"list first, then act on an id from the list.",
		],
	},
	chrome_vision: {
		label: "Chrome vision",
		description:
			"Save a screenshot to disk and return the path; read the path to see the picture.",
		parameters: Type.Object({
			full_page: Type.Optional(
				Type.Boolean({
					description: "Capture the whole page instead of the viewport.",
				}),
			),
			tab: tabParam(),
		}),
		promptGuidelines: [
			"screenshots are files; read the path instead of capturing twice.",
		],
	},
	chrome_cdp: {
		label: "Chrome CDP",
		description:
			"Raw Chrome DevTools Protocol escape hatch; the JSON result comes back unchanged.",
		parameters: Type.Object({
			method: Type.String({
				description: "CDP method name, such as Page.getLayoutMetrics.",
			}),
			params: Type.Optional(Type.Unknown()),
			tab: tabParam(),
		}),
		promptGuidelines: [
			"prefer the high-level tools; drop to CDP only where they stop.",
		],
	},
} satisfies Record<string, ToolSpec>;

/** 配置里的工具开关与名字，用来裁剪默认定义。 */
export interface SurfaceSettings {
	enabled: boolean;
	name: string;
}

/**
 * `guidance.<id>` 的覆盖字段。`""` 与 `[]` 表示清空。
 * 规则只写句子：工具名由 `buildSurface` 加，改名后规则跟着改。
 */
export interface GuidanceOverride {
	description?: string;
	promptSnippet?: string;
	promptGuidelines?: string[];
}

/** 一个注册用的工具定义，不含执行器。`id` 用来找执行器，不受改名影响。 */
export interface SurfaceTool {
	id: string;
	name: string;
	label: string;
	description: string;
	promptSnippet?: string;
	promptGuidelines: string[];
	parameters: TSchema;
}

/**
 * 按 `tools.*` 的开关与名字、`guidance.*` 的文案覆盖，裁剪出最终工具面。
 * 关掉的工具不出现；覆盖逐字段生效，未覆盖的字段保留默认文案。
 */
export function buildSurface(
	settings: Record<string, SurfaceSettings>,
	guidance: Record<string, GuidanceOverride | undefined>,
): SurfaceTool[] {
	const surface: SurfaceTool[] = [];
	for (const [id, spec] of Object.entries(TOOL_SPECS)) {
		const setting = settings[id];
		if (setting === undefined) {
			throw new Error(
				`no tool settings for "${id}"; the id lists in config/ and tools/ have diverged`,
			);
		}
		if (!setting.enabled) continue;
		const override = guidance[id] ?? {};
		const rules = override.promptGuidelines ?? spec.promptGuidelines;
		const tool: SurfaceTool = {
			id,
			name: setting.name,
			label: spec.label,
			description: override.description ?? spec.description,
			// pi 平铺规则时不加工具前缀，所以名字在这里拼一次；改名后规则跟着改名。
			promptGuidelines: rules.map((line) => `${setting.name}: ${line}`),
			parameters: spec.parameters,
		};
		const snippet = override.promptSnippet;
		if (snippet !== undefined && snippet !== "") tool.promptSnippet = snippet;
		surface.push(tool);
	}
	return surface;
}
