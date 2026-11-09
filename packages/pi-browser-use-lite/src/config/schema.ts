/**
 * 配置契约：公开常量、类型与默认值。
 * 校验逻辑在 validate.ts；文件定位与读取在 index.ts。
 */

export const ENV_AGENT_DIR = "PI_CODING_AGENT_DIR";
export const CONFIG_SUBPATH = "pi-browser-use-lite";
export const CONFIG_FILE_NAME = "config.json";

export const TOOL_IDS = [
	"chrome_act",
	"chrome_see",
	"chrome_tab",
	"chrome_vision",
	"chrome_cdp",
] as const;
export type ToolId = (typeof TOOL_IDS)[number];

export const SCREENSHOT_FORMATS = ["png", "jpeg"] as const;
export type ScreenshotFormat = (typeof SCREENSHOT_FORMATS)[number];

export const GUIDANCE_KEYS = [
	"description",
	"promptSnippet",
	"promptGuidelines",
] as const;

/** 工具名：小写字母开头，只含小写字母、数字与下划线，最长 32 字符。 */
export const TOOL_NAME_PATTERN = /^[a-z][a-z0-9_]{0,31}$/;

/** 宿主内置工具名，扩展工具不得占用。 */
export const RESERVED_TOOL_NAMES: ReadonlySet<string> = new Set([
	"bash",
	"edit",
	"find",
	"grep",
	"ls",
	"powershell",
	"read",
	"write",
	"tool_search",
]);

/** 数值字段的 clamp 区间；越界取边界值而非报错。 */
export const RANGES = {
	port: [1, 65_535],
	dragSteps: [1, 100],
	scrollSteps: [1, 100],
	navigateTimeoutMs: [1_000, 120_000],
	maxElements: [1, 1_000],
	textChars: [1_000, 200_000],
	keepNewest: [1, 1_000],
} as const satisfies Record<string, readonly [number, number]>;

export interface GuidanceFields {
	description?: string;
	promptSnippet?: string;
	promptGuidelines?: string[];
}

export interface ToolSettings {
	enabled: boolean;
	name: string;
}

/** 已完成校验与 clamp 的最终配置。 */
export interface ResolvedConfig {
	bridge: { port: number };
	policy: {
		authorizeOnStart: boolean;
		closeOwnTabsOnExit: boolean;
	};
	input: { dragSteps: number; scrollSteps: number };
	timing: { navigateTimeoutMs: number };
	output: { maxElements: number; textChars: number };
	screenshot: { dir: string; format: ScreenshotFormat; keepNewest: number };
	tools: Record<ToolId, ToolSettings>;
	guidance: Partial<Record<ToolId, GuidanceFields>>;
}

/**
 * 13 个标量字段的默认值。工具记录与文案覆盖不在其中。
 * `screenshot.dir` 跟着 agent 目录走，由 buildConfig 补，不在这里。
 */
export const DEFAULTS: Omit<
	ResolvedConfig,
	"tools" | "guidance" | "screenshot"
> & {
	screenshot: Omit<ResolvedConfig["screenshot"], "dir">;
} = {
	bridge: { port: 17_318 },
	policy: {
		authorizeOnStart: false,
		closeOwnTabsOnExit: true,
	},
	input: { dragSteps: 10, scrollSteps: 5 },
	timing: { navigateTimeoutMs: 15_000 },
	output: { maxElements: 80, textChars: 18_000 },
	screenshot: { format: "png", keepNewest: 20 },
};

export type Raw = Record<string, unknown>;
/** 校验错误文本列表，格式为 `<field path>: <reason>`。 */
export type Errors = string[];
