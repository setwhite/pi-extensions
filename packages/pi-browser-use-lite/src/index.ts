/**
 * pi-browser-use-lite — Pi 扩展入口。
 * 配置损坏或工具名非法时启动即抛错（fail fast，不静默退化成空扩展）。
 */

import type {
	ExtensionAPI,
	ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Bridge } from "./bridge/index.ts";
import {
	completeChromeArgument,
	createChromeCommand,
} from "./commands/index.ts";
import { agentDir, HOST_VERSION, loadConfig } from "./config/index.ts";
import { createSessionPolicy, type SessionPolicy } from "./policy/index.ts";
import {
	createExecutors,
	type Executors,
	type SessionTarget,
} from "./tools/exec/index.ts";
import { buildSurface, type SurfaceTool } from "./tools/index.ts";
import { errorResult } from "./tools/result.ts";

export default function piBrowserUseLite(pi: ExtensionAPI): void {
	const config = loadConfig(agentDir());
	const policy = createSessionPolicy(config.policy);
	const bridge = new Bridge({
		port: config.bridge.port,
		hostVersion: HOST_VERSION,
	});
	// 本会话的自动化 target：navigate 与 tab.new 成功后写，/chrome status 读。
	const target = createTargetHolder();
	const chrome = createChromeCommand({
		policy,
		bridge,
		hostVersion: HOST_VERSION,
		targetId: () => target.get(),
	});
	const executors = createExecutors({ bridge, config, target });

	for (const tool of buildSurface(config.tools, config.guidance)) {
		pi.registerTool(registerable(tool, policy, executors));
	}

	pi.registerCommand("chrome", {
		description: "authorize the tools, or report the bridge state",
		getArgumentCompletions: completeChromeArgument,
		handler: async (args, ctx) => {
			ctx.ui.notify(await chrome.run(args));
		},
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		// 会话结束时按配置清掉本会话开的标签。清不掉要说出来：吞掉失败，用户只会看到标签留着。
		try {
			await bridge.send(
				"automation.cleanup",
				{
					sessionKey: sessionKeyOf(ctx),
					closeOwnTabs: config.policy.closeOwnTabsOnExit,
				},
				{ timeoutMs: 5_000 },
			);
		} catch (cause) {
			ctx.ui.notify(
				`could not clean up the automation tabs: ${cause instanceof Error ? cause.message : String(cause)}`,
				"warning",
			);
		}
		policy.endSession();
		await bridge.stop();
	});
}

/**
 * 工具定义补上执行器。
 * 策略拒绝走结果而不是抛出：SDK 会把抛出的错误换成 details 为 {} 的结果，SPEC-0001 要的 details.error 就丢了。
 */
function registerable(
	tool: SurfaceTool,
	policy: SessionPolicy,
	executors: Executors,
): ToolDefinition {
	return {
		...tool,
		execute: async (_toolCallId, params, signal, _onUpdate, ctx) => {
			const denial = policy.check();
			if (denial) return errorResult(denial);
			return await executors.execute(
				tool.id,
				params,
				sessionKeyOf(ctx),
				signal,
			);
		},
	};
}

/** 本会话的 key：扩展按它分 target 台账。 */
function sessionKeyOf(ctx: {
	sessionManager: { getSessionId(): string };
}): string {
	return ctx.sessionManager.getSessionId();
}

/** 会话 target 的持有者。执行器写，命令读。 */
function createTargetHolder(): SessionTarget {
	let id: number | undefined;
	return {
		get: () => id,
		set: (next: number) => {
			id = next;
		},
	};
}

/** 参数里的动作名。只有 chrome_act 与 chrome_tab 带 action，别的工具给空串。 */
