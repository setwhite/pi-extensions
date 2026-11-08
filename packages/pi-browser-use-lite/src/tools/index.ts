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
				"Tab id, URL substring or title substring. Omit it to use this session's automation target.",
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
			"Drive the user's real browser. One dispatcher for every interaction: navigate, click, type, fill, press, hover, drag, scroll, upload, eval, wait, and batch. Only action is required; every other parameter applies to the action you name. Pass tab to work on a named tab, omit it to use this session's automation target. Prefer refs from the snapshot over selectors or coordinates. Pass see to get a snapshot back together with the result. The reply is an ok line with the change count, or a classified error with a hint.",
		parameters: Type.Object({
			action: Type.Enum(ACT_ACTIONS, {
				description:
					"Interaction to run. Every other parameter applies to the action named here; values that action does not read are ignored.",
			}),
			tab: tabParam(),
			see: Type.Optional(
				Type.Enum(SEE_MODES, {
					description:
						"Append a snapshot after the action finishes. changes reports what this action changed, which is the cheapest way to confirm it worked.",
				}),
			),
			url: Type.Optional(
				Type.String({
					description:
						"Absolute http(s) URL to load, for navigate. Returns after the load event fires and the page settles.",
				}),
			),
			init_script: Type.Optional(
				Type.String({
					description:
						"JavaScript to run in the new document before the page's own scripts start, for navigate.",
				}),
			),
			ref: Type.Optional(
				Type.String({
					description:
						"Element ref from a snapshot, such as e12. The most reliable locator for click, hover, type, fill and drag.",
				}),
			),
			selector: Type.Optional(
				Type.String({
					description:
						"CSS selector for the element. Use it only when the page or a query gave you no ref to work with.",
				}),
			),
			x: Type.Optional(
				Type.Number({
					description:
						"Viewport x in CSS pixels, for clicks on canvas, maps or other areas that have no element to point at.",
				}),
			),
			y: Type.Optional(
				Type.Number({
					description:
						"Viewport y in CSS pixels, paired with x for the same click or hover.",
				}),
			),
			text: Type.Optional(
				Type.String({
					description:
						"Text to type into the focused element, or the value to set when filling a single field.",
				}),
			),
			replace: Type.Optional(
				Type.Boolean({
					description:
						"Clear the field before typing instead of appending to the text already there.",
				}),
			),
			press: Type.Optional(
				Type.String({
					description:
						"Key to send after typing, such as Enter or Tab, to commit the value.",
				}),
			),
			key: Type.Optional(
				Type.String({
					description:
						"Key or chord to press on its own: Enter, Escape, Tab, or Ctrl+A.",
				}),
			),
			fields: Type.Optional(
				Type.Array(
					Type.Object({
						ref: Type.Optional(
							Type.String({
								description: "Field ref from a snapshot, such as e7.",
							}),
						),
						selector: Type.Optional(
							Type.String({
								description:
									"Field CSS selector, for when no ref is available.",
							}),
						),
						value: Type.String({
							description:
								"Value to put in the field; it replaces whatever is stored there.",
						}),
					}),
					{
						description:
							"Fields to fill in one call. Each entry takes a ref or a selector plus its value, and the stored value is replaced wholesale.",
					},
				),
			),
			from_ref: Type.Optional(
				Type.String({
					description:
						"Drag source ref. Name one locator for the source and one for the target.",
				}),
			),
			from_selector: Type.Optional(
				Type.String({
					description:
						"Drag source CSS selector, for when the source has no ref.",
				}),
			),
			from_x: Type.Optional(
				Type.Number({
					description:
						"Drag source x in CSS pixels, paired with from_y for a bare point.",
				}),
			),
			from_y: Type.Optional(
				Type.Number({
					description: "Drag source y in CSS pixels, paired with from_x.",
				}),
			),
			to_ref: Type.Optional(
				Type.String({
					description: "Drag target ref, such as a slider position e21.",
				}),
			),
			to_selector: Type.Optional(
				Type.String({
					description:
						"Drag target CSS selector, for when the target has no ref.",
				}),
			),
			to_x: Type.Optional(
				Type.Number({
					description:
						"Drag target x in CSS pixels, paired with to_y for a bare point.",
				}),
			),
			to_y: Type.Optional(
				Type.Number({
					description: "Drag target y in CSS pixels, paired with to_x.",
				}),
			),
			dy: Type.Optional(
				Type.Number({
					description:
						"Vertical scroll delta in CSS pixels. Positive scrolls down, negative scrolls up.",
				}),
			),
			dx: Type.Optional(
				Type.Number({
					description:
						"Horizontal scroll delta in CSS pixels. Positive scrolls right.",
				}),
			),
			paths: Type.Optional(
				Type.Array(Type.String(), {
					description:
						"Absolute paths of files to upload. The next file chooser that opens receives them, and the paths should point at files that already exist.",
				}),
			),
			js: Type.Optional(
				Type.String({
					description:
						"JavaScript to evaluate in the page. The expression is awaited, so it may return a promise, and the result comes back as JSON or as text.",
				}),
			),
			kind: Type.Optional(
				Type.Enum(WAIT_KINDS, {
					description: "What to wait for: selector, expression or text.",
				}),
			),
			value: Type.Optional(
				Type.String({
					description:
						"The selector, expression or text that wait polls for, once per 250ms.",
				}),
			),
			timeout_ms: Type.Optional(
				Type.Number({
					description:
						"How long wait polls before it gives up, in milliseconds. Defaults to 15000.",
				}),
			),
			steps: Type.Optional(
				Type.Array(
					Type.Object({
						action: Type.Enum(ACT_ACTIONS, {
							description:
								"Action this step runs, using the same names as a top-level call.",
						}),
						optional: Type.Optional(
							Type.Boolean({
								description:
									"Keep going after this step fails instead of aborting the rest of the batch.",
							}),
						),
						args: Type.Optional(
							Type.Unknown({
								description:
									'Arguments for this step, named exactly like the parameters of a top-level call. For example {"ref": "e12"} for a click step.',
							}),
						),
					}),
					{
						description:
							"Steps to run in order, at most 50. A step that fails stops the batch unless it set optional, and the reply says which step stopped it.",
					},
				),
			),
		}),
		promptGuidelines: [
			"chrome_act: name the action first, then send only the parameters that action reads.",
			"chrome_act: batch runs steps in order and stops at the first failure unless the step is optional.",
		],
	},
	chrome_see: {
		label: "Chrome see",
		description:
			"Read the page. mode refs is the default and the cheapest way to look: title, summary, heading tree, elements with refs, form state, hints and changes, never body text. mode text returns the heading tree and then the body. mode changes returns only what changed since the previous snapshot. mode full returns every field, including layout. Use query for a natural-language lookup that returns the best matching refs, ref or selector to inspect one element in depth, logs to read the console or network records captured since this tab loaded, and request_id for a single request record.",
		parameters: Type.Object({
			mode: Type.Optional(
				Type.Enum(SEE_MODES, {
					description:
						"What to return: refs for elements with refs, text for the body, changes for the last diff, full for every field. Defaults to refs.",
				}),
			),
			query: Type.Optional(
				Type.String({
					description:
						"Natural-language description of the element you need. Returns the best matching refs in order of relevance.",
				}),
			),
			ref: Type.Optional(
				Type.String({
					description:
						"Ref to inspect in depth, such as e12. Returns that element's attributes, state and text.",
				}),
			),
			selector: Type.Optional(
				Type.String({
					description:
						"CSS selector to inspect in depth, for when you have no ref for the element you need.",
				}),
			),
			logs: Type.Optional(
				Type.Enum(["console", "network"] as const, {
					description:
						"Which records to read: console or network, captured from this tab's navigation onwards.",
				}),
			),
			request_id: Type.Optional(
				Type.String({
					description:
						"Identifier of one network request, to return its full record including bodies.",
				}),
			),
			clear: Type.Optional(
				Type.Boolean({
					description:
						"Empty the chosen log after reading it, so the next read starts clean.",
				}),
			),
			tab: tabParam(),
		}),
		promptGuidelines: [
			"chrome_see: read before you act; refs is cheaper than text.",
			"chrome_see: mode changes answers what moved; do not re-read the whole page to find it.",
		],
	},
	chrome_tab: {
		label: "Chrome tab",
		description:
			"Manage the tabs in this session's own browser window. action list prints every tab there with its id, the active marker, title and URL. new opens a tab there, switch brings that window to the front on a tab, close closes a tab. switch and close need tab, which matches a tab id, a URL substring or a title substring. A match that hits several tabs lists up to five candidates instead of guessing, so a vague name costs one extra call rather than the wrong tab.",
		parameters: Type.Object({
			action: Type.Enum(TAB_ACTIONS, {
				description: "Tab operation: list, new, switch or close.",
			}),
			tab: Type.Optional(
				Type.String({
					description:
						"Tab id, URL substring or title substring. switch and close need it; list and new do not.",
				}),
			),
			url: Type.Optional(
				Type.String({
					description:
						"Absolute http(s) URL to open, for new. Omit it to open a blank tab you navigate later.",
				}),
			),
		}),
		promptGuidelines: [
			"chrome_tab: do not switch or close tabs the user did not name.",
			"chrome_tab: list first when the user names a site, then act on the id that list returned.",
		],
	},
	chrome_vision: {
		label: "Chrome vision",
		description:
			"Save a screenshot to disk and return the path. Without full_page the image is the current viewport. full_page captures the whole page in one image, unless the page is taller than four viewports, in which case it is captured screen by screen into tiles named -1ofN. The reply carries file paths only, never image data; read a path to look at the picture. Format and directory come from configuration, so the same call always lands in the same place.",
		parameters: Type.Object({
			full_page: Type.Optional(
				Type.Boolean({
					description:
						"Capture the whole page instead of the viewport. Pages taller than four viewports come back as several tiles.",
				}),
			),
			tab: tabParam(),
		}),
		promptGuidelines: [
			"chrome_vision: screenshots are files; read the path when the picture matters and do not capture twice.",
		],
	},
	chrome_cdp: {
		label: "Chrome CDP",
		description:
			"Raw Chrome DevTools Protocol escape hatch for everything the other tools do not cover. Send any method, such as Page.getLayoutMetrics or Network.enable, with its argument object, and the JSON result comes back unchanged. It runs on this session's automation target, or on the tab you name. It does not enumerate targets: use chrome_tab list to find tab ids first, then pass one here.",
		parameters: Type.Object({
			method: Type.String({
				description:
					"CDP method name, such as Page.getLayoutMetrics, Runtime.evaluate or Network.enable.",
			}),
			params: Type.Optional(
				Type.Unknown({
					description:
						"Argument object for the method. Omit it for methods that take no arguments.",
				}),
			),
			tab: tabParam(),
		}),
		promptGuidelines: [
			"chrome_cdp: prefer the high-level tools; drop to CDP only where they stop.",
		],
	},
} satisfies Record<string, ToolSpec>;

/** 配置里的工具开关与名字，用来裁剪默认定义。 */
export interface SurfaceSettings {
	enabled: boolean;
	name: string;
}

/** `guidance.<id>` 的覆盖字段。`""` 与 `[]` 表示清空。 */
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
		const tool: SurfaceTool = {
			id,
			name: setting.name,
			label: spec.label,
			description: override.description ?? spec.description,
			promptGuidelines: override.promptGuidelines ?? spec.promptGuidelines,
			parameters: spec.parameters,
		};
		const snippet = override.promptSnippet;
		if (snippet !== undefined && snippet !== "") tool.promptSnippet = snippet;
		surface.push(tool);
	}
	return surface;
}
