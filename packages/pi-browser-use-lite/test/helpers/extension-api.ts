import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
	AgentToolResult,
	ExtensionAPI,
	ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { vi } from "vitest";

const dirs: string[] = [];

/** 每个用例独立的 agent 目录；config 为 undefined 时不写文件（全默认值）。 */
export function useConfig(config?: unknown): void {
	const dir = mkdtempSync(join(tmpdir(), "pi-browser-lite-"));
	dirs.push(dir);
	if (config !== undefined) {
		mkdirSync(join(dir, "pi-browser-use-lite"), { recursive: true });
		writeFileSync(
			join(dir, "pi-browser-use-lite", "config.json"),
			JSON.stringify(config),
			"utf-8",
		);
	}
	vi.stubEnv("PI_CODING_AGENT_DIR", dir);
}

/** 清掉 `useConfig` 建的目录并还原环境变量。放进各测试文件的 `afterEach`。 */
export function cleanupConfig(): void {
	vi.unstubAllEnvs();
	for (const dir of dirs.splice(0))
		rmSync(dir, { recursive: true, force: true });
}

export interface FakeApi {
	api: ExtensionAPI;
	registered: ToolDefinition[];
	/** 跑一条已注册的命令，返回它 `ui.notify` 打印的文本。 */
	runCommand: (name: string, args: string) => Promise<string>;
	/** 触发 `session_shutdown`。 */
	shutdown: () => Promise<void>;
	/** 触发 `before_agent_start`，返回扩展改过的 systemPromptOptions。 */
	startRun: (promptGuidelines: string[]) => { promptGuidelines: string[] };
}

/** 只记注册项、命令与两个事件的假 `ExtensionAPI`。 */
export function fakeApi(): FakeApi {
	const registered: ToolDefinition[] = [];
	const commands = new Map<string, (args: string) => Promise<string>>();
	const shutdowns: Array<(...args: unknown[]) => unknown> = [];
	const starts: Array<(payload: unknown) => void> = [];
	const api = {
		registerTool: (tool: ToolDefinition) => void registered.push(tool),
		// 签名取自 SDK：它改了这里就跟着红，不用手抄。
		registerCommand: (
			name: string,
			{ handler }: Parameters<ExtensionAPI["registerCommand"]>[1],
		) => {
			commands.set(name, async (args) => {
				const printed: string[] = [];
				// 命令上下文只用到 ui.notify，其余成员测试不碰。
				const ctx = {
					ui: { notify: (text: string) => void printed.push(text) },
				} as unknown as Parameters<typeof handler>[1];
				await handler(args, ctx);
				return printed.join("\n");
			});
		},
		on: (event: string, handler: (payload: unknown) => void) => {
			if (event === "session_shutdown") shutdowns.push(handler);
			if (event === "before_agent_start") starts.push(handler);
			return () => {};
		},
	};
	const startRun = (promptGuidelines: string[]) => {
		const systemPromptOptions = { promptGuidelines };
		for (const handler of starts)
			handler({ type: "before_agent_start", systemPromptOptions });
		return systemPromptOptions;
	};
	return {
		api: api as unknown as ExtensionAPI,
		registered,
		runCommand: async (name, args) => {
			const run = commands.get(name);
			if (run === undefined) throw new Error(`no command registered: ${name}`);
			return await run(args);
		},
		shutdown: async () => {
			for (const handler of shutdowns) await handler();
		},
		startRun,
	};
}

/** 调一次工具的执行器。参数与上下文都不参与策略判定。 */
export function callTool(
	tool: ToolDefinition,
	params: unknown = {},
): Promise<AgentToolResult<unknown>> {
	return tool.execute(
		"call-1",
		params as never,
		undefined,
		undefined,
		{} as never,
	);
}
