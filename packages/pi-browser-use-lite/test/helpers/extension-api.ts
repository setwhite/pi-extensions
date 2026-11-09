import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
	AgentToolResult,
	ExtensionAPI,
	ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { vi } from "vitest";
import { Bridge } from "../../src/bridge/index.ts";
import { BridgeError } from "../../src/protocol/index.ts";

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
	/** 一条已注册命令的注册项，用来读 `getArgumentCompletions`。 */
	commandOptions: (
		name: string,
	) => Parameters<ExtensionAPI["registerCommand"]>[1] | undefined;
	/** 跑一条已注册的命令，返回它 `ui.notify` 打印的文本。 */
	runCommand: (name: string, args: string) => Promise<string>;
	/** 触发 `session_shutdown`。 */
	shutdown: () => Promise<void>;
}

/** 只记注册项、命令与 `session_shutdown` 的假 `ExtensionAPI`。 */
export function fakeApi(): FakeApi {
	const registered: ToolDefinition[] = [];
	const commands = new Map<string, (args: string) => Promise<string>>();
	const commandOptions = new Map<
		string,
		Parameters<ExtensionAPI["registerCommand"]>[1]
	>();
	const shutdowns: Array<(...args: unknown[]) => unknown> = [];
	const api = {
		registerTool: (tool: ToolDefinition) => void registered.push(tool),
		// 签名取自 SDK：它改了这里就跟着红，不用手抄。
		registerCommand: (
			name: string,
			options: Parameters<ExtensionAPI["registerCommand"]>[1],
		) => {
			commandOptions.set(name, options);
			const { handler } = options;
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
			return () => {};
		},
	};
	return {
		api: api as unknown as ExtensionAPI,
		registered,
		commandOptions: (name) => commandOptions.get(name),
		runCommand: async (name, args) => {
			const run = commands.get(name);
			if (run === undefined) throw new Error(`no command registered: ${name}`);
			return await run(args);
		},
		shutdown: async () => {
			for (const handler of shutdowns)
				await handler({ type: "session_shutdown" }, FAKE_CTX);
		},
	};
}

/** 调一次工具的执行器。参数与上下文都不参与策略判定。 */
/**
 * 让桥不真的绑端口：起桥即成功、报扩展没连上、发命令即以 `bridge_unreachable` 拒绝。
 * 入口层测试只想看策略是否放行，不该占 17318。
 */
export function stubBridge(): void {
	vi.spyOn(Bridge.prototype, "start").mockResolvedValue(undefined);
	vi.spyOn(Bridge.prototype, "describe").mockResolvedValue({
		mode: "server",
		url: "http://127.0.0.1:17318",
		connected: false,
		queuedCommands: 0,
		pendingCommands: 0,
	});
	vi.spyOn(Bridge.prototype, "send").mockRejectedValue(
		new BridgeError(
			"bridge_unreachable",
			"the bridge is not running (stopped)",
		),
	);
}

/** 会话结束等路径会往 ui.notify 说话，测试靠它断言。 */
export const notifyMock = vi.fn();

/** 工具上下文里执行器只用到会话 id，其余成员测试不碰。 */
const FAKE_CTX = {
	sessionManager: { getSessionId: () => "s1" },
	ui: { notify: notifyMock },
} as never;

export function callTool(
	tool: ToolDefinition,
	params: unknown = {},
): Promise<AgentToolResult<unknown>> {
	return tool.execute(
		"call-1",
		params as never,
		undefined,
		undefined,
		FAKE_CTX,
	);
}
