/**
 * pi-browser-use-lite — Pi 扩展入口。
 * 做三件事：loadConfig、按 tools.* / guidance.* 注册工具、把 prompt.guidelines 注入系统提示。
 * 配置损坏或工具名非法时启动即抛错（fail fast，不静默退化成空扩展）。
 */

import type {
	ExtensionAPI,
	ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { agentDir, loadConfig } from "./config/index.ts";
import { buildSurface, type SurfaceTool } from "./tools/index.ts";

export default function piBrowserUseLite(pi: ExtensionAPI): void {
	const config = loadConfig(agentDir());

	for (const tool of buildSurface(config.tools, config.guidance)) {
		pi.registerTool(registerable(tool));
	}

	pi.on("before_agent_start", (event) => {
		event.systemPromptOptions.promptGuidelines = [
			...event.systemPromptOptions.promptGuidelines,
			...config.prompt.guidelines,
		];
	});
}

/** 工具定义补上执行器。执行器由 T23 接入；在那之前调用直接报错，不假装成功。 */
function registerable(tool: SurfaceTool): ToolDefinition {
	return {
		...tool,
		execute: async () => {
			throw new Error(`${tool.name}: executor is not wired yet (T23)`);
		},
	};
}
