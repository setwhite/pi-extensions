/**
 * 配置模块：定位并读取 `<agent dir>/pi-browser-use-lite/config.json`。
 * 文件缺失 = 全默认值；JSON 损坏或字段非法 = 抛 Error，消息含文件路径。
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
	CONFIG_FILE_NAME,
	CONFIG_SUBPATH,
	ENV_AGENT_DIR,
	type Raw,
	type ResolvedConfig,
} from "./schema.ts";
import { buildConfig } from "./validate.ts";

export * from "./schema.ts";

/** 配置文件路径：`PI_CODING_AGENT_DIR` 优先，否则 `~/.pi/agent`，再加子路径。 */
export function configPath(env: NodeJS.ProcessEnv = process.env): string {
	return configFile(env[ENV_AGENT_DIR] || join(homedir(), ".pi", "agent"));
}

/** 读取并校验配置。文件不存在时返回全默认值。校验失败抛 Error。 */
export function loadConfig(agentDir: string): ResolvedConfig {
	const file = configFile(agentDir);
	const errors: string[] = [];
	const config = buildConfig(readRaw(file), errors);
	if (errors.length > 0) {
		const lines = errors.map((item) => `- ${item}`).join("\n");
		throw new Error(`${file}: ${errors.length} invalid field(s):\n${lines}`);
	}
	return config;
}

function configFile(agentDir: string): string {
	return join(agentDir, CONFIG_SUBPATH, CONFIG_FILE_NAME);
}

function readRaw(file: string): Raw {
	let text: string;
	try {
		text = readFileSync(file, "utf-8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
		throw new Error(`cannot read config file ${file}: ${errorText(error)}`);
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch (error) {
		throw new Error(
			`config file ${file} is not valid JSON: ${errorText(error)}`,
		);
	}
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		throw new Error(
			`config file ${file} must be a JSON object at the top level`,
		);
	}
	return parsed as Raw;
}

function errorText(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
