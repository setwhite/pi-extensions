/**
 * pi-browser-use-lite — Pi 扩展入口。
 * 配置损坏或工具名非法时启动即抛错（fail fast，不静默退化成空扩展）。
 */

import type {
	AgentToolResult,
	ExtensionAPI,
	ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Bridge } from "./bridge/index.ts";
import { createChromeCommand } from "./commands/index.ts";
import { agentDir, HOST_VERSION, loadConfig } from "./config/index.ts";
import {
	createSessionPolicy,
	type PolicyDenial,
	type SessionPolicy,
} from "./policy/index.ts";
import { buildSurface, type SurfaceTool } from "./tools/index.ts";

export default function piBrowserUseLite(pi: ExtensionAPI): void {
	const config = loadConfig(agentDir());
	const policy = createSessionPolicy(config.policy);
	const bridge = new Bridge({
		port: config.bridge.port,
		hostVersion: HOST_VERSION,
	});
	const chrome = createChromeCommand({
		policy,
		bridge,
		hostVersion: HOST_VERSION,
	});

	for (const tool of buildSurface(config.tools, config.guidance)) {
		pi.registerTool(registerable(tool, policy));
	}

	pi.registerCommand("chrome", {
		description: "authorize, background, or report the bridge state",
		handler: async (args, ctx) => {
			ctx.ui.notify(await chrome.run(args));
		},
	});

	pi.on("session_shutdown", async () => {
		policy.endSession();
		await bridge.stop();
	});

	pi.on("before_agent_start", (event) => {
		event.systemPromptOptions.promptGuidelines = [
			...event.systemPromptOptions.promptGuidelines,
			...config.prompt.guidelines,
		];
	});
}

/**
 * 工具定义补上执行器。执行器由 T23 接入；在那之前调用直接报错，不假装成功。
 * 策略拒绝走结果而不是抛出：SDK 会把抛出的错误换成 details 为 {} 的结果，SPEC-0001 要的 details.error 就丢了。
 */
function registerable(
	tool: SurfaceTool,
	policy: SessionPolicy,
): ToolDefinition {
	return {
		...tool,
		execute: async (_toolCallId, params) => {
			const denial = policy.check(actionOf(params));
			if (denial) return refusal(denial);
			throw new Error(`${tool.name}: executor is not wired yet (T23)`);
		},
	};
}

/** 参数里的动作名。只有 chrome_act 与 chrome_tab 带 action，别的工具给空串。 */
function actionOf(params: unknown): string {
	const action = (params as { action?: unknown } | null | undefined)?.action;
	return typeof action === "string" ? action : "";
}

/** 策略拒绝的结果：两行文案给模型，details.error 给程序化调用方。 */
function refusal(denial: PolicyDenial): AgentToolResult<{
	error: PolicyDenial;
}> {
	return {
		content: [
			{
				type: "text",
				text: `${denial.class}: ${denial.message}\nhint: ${denial.hint}`,
			},
		],
		details: { error: denial },
		isError: true,
	};
}
