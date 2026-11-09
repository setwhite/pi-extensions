import type { ResolvedConfig } from "../../../src/config/index.ts";
import { DEFAULTS } from "../../../src/config/index.ts";
import type { ActionName } from "../../../src/protocol/index.ts";
import type {
	ExecBridge,
	SessionTarget,
} from "../../../src/tools/exec/common.ts";
import { createExecutors } from "../../../src/tools/exec/index.ts";

export interface Sent {
	action: ActionName;
	params: Record<string, unknown>;
	timeoutMs: number | undefined;
}

export const CONFIG = {
	...DEFAULTS,
	tools: {},
	guidance: {},
} as ResolvedConfig;

/** 执行器的测试夹层：记录发出的命令，按 `reply` 造应答。 */
export function harness(
	options: {
		reply?: (action: ActionName, params: Record<string, unknown>) => unknown;
		connected?: boolean;
	} = {},
) {
	const sent: Sent[] = [];
	let target: number | undefined;
	const bridge: ExecBridge = {
		start: async () => undefined,
		waitForFirstPoll: async () => ({
			mode: "server",
			url: "http://127.0.0.1:17318",
			connected: options.connected ?? true,
			queuedCommands: 0,
			pendingCommands: 0,
		}),
		send: async (action, params = {}, sendOptions = {}) => {
			sent.push({ action, params, timeoutMs: sendOptions.timeoutMs });
			return options.reply?.(action, params) ?? {};
		},
	};
	const targetHolder: SessionTarget = {
		get: () => target,
		set: (next: number) => {
			target = next;
		},
	};
	const executors = createExecutors({
		bridge,
		config: CONFIG,
		target: targetHolder,
		saveScreenshots: async ({ images }) =>
			images.map((_, index) => `/tmp/shot-${index + 1}.png`),
	});
	return {
		sent,
		target: targetHolder,
		run: (toolId: string, params: unknown) =>
			executors.execute(toolId, params, "s1"),
	};
}

/** 取结果里的正文。 */
export function textOf(result: { content: unknown[] }): string {
	const block = result.content[0] as { text?: string } | undefined;
	return block?.text ?? "";
}
