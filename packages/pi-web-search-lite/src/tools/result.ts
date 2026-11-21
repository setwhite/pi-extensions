/**
 * 工具结果信封：宿主截断 + 超限 spill 到临时文件。
 * 唯一允许 import 宿主包（工具类型与截断工具）的工具层文件；其余模块不依赖宿主 API。
 */

import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
	type AgentToolResult,
	DEFAULT_MAX_BYTES,
	DEFAULT_MAX_LINES,
	truncateHead,
} from "@earendil-works/pi-coding-agent";

export type {
	AgentToolResult,
	Theme,
	ToolDefinition,
	ToolRenderResultOptions,
} from "@earendil-works/pi-coding-agent";

export interface FinalizeOptions {
	/** `config.context.maxInlineChars`；null = 宿主 DEFAULT_MAX_BYTES。超过宿主上限时按宿主上限截断。 */
	maxInlineChars: number | null;
	maxInlineLines: number | null;
	spillToFile: boolean;
	/** spill 根目录（`config.spillRoot`）；只在截断且 spillToFile 为真时用到。 */
	spillRoot: string;
	/** 会话标识：每个会话一个子目录。缺省归到 `unscoped`。 */
	sessionId?: string;
	/** 文件名前缀；同一会话多次 spill 靠时间戳与序号区分。缺省 `output`。 */
	fileStem?: string;
	/** 测试注入；缺省读系统时钟。 */
	now?: () => number;
}

export interface FinalizeOutcome {
	content: string;
	truncated: boolean;
	fullOutputPath?: string;
}

/** 截断并按配置 spill：返回模型可见 content（含续读提示）与结构化标记。 */
export async function finalizeContent(
	text: string,
	options: FinalizeOptions,
): Promise<FinalizeOutcome> {
	const result = truncateHead(text, {
		maxBytes: clampToHost(options.maxInlineChars, DEFAULT_MAX_BYTES),
		maxLines: clampToHost(options.maxInlineLines, DEFAULT_MAX_LINES),
	});
	if (!result.truncated) return { content: text, truncated: false, fullOutputPath: undefined };

	let fullOutputPath: string | undefined;
	let spillFailure: string | undefined;
	if (options.spillToFile) {
		try {
			fullOutputPath = await writeSpill(text, options);
		} catch (error) {
			// 落盘失败不该连累这次抓取：正文还在，用一行说清楚没写成
			spillFailure = error instanceof Error ? error.message : String(error);
		}
	}

	const notes = [
		`[... output truncated: ${result.totalLines} lines / ${result.totalBytes} bytes total, kept ${result.outputLines} lines here.]`,
		fullOutputPath !== undefined
			? `Full output written to ${fullOutputPath}; read that file to continue.`
			: spillFailure !== undefined
				? `Full output not written: ${spillFailure}`
				: "Not written to a temp file (context.spillToFile is false).",
	];
	return { content: `${result.content}\n\n${notes.join("\n")}`, truncated: true, fullOutputPath };
}

/** 组装宿主工具结果：文本进模型上下文，结构化数据只进 details。 */
export function buildToolResult<T>(text: string, details: T): AgentToolResult<T> {
	return { content: [{ type: "text", text }], details };
}

const SPILL_NAME_ATTEMPTS = 100;
const SESSION_SEGMENT = /^[A-Za-z0-9._-]{1,64}$/;
const UNSCOPED_SESSION = "unscoped";
/** 会话目录的保留期：超过 7 天没动过就在下次启动时删掉。 */
export const SPILL_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** 写全文并返回路径；同会话同毫秒再写一次时靠序号找空位，不覆盖已回填的路径。 */
async function writeSpill(text: string, options: FinalizeOptions): Promise<string> {
	const dir = join(options.spillRoot, sessionSegment(options.sessionId));
	await mkdir(dir, { recursive: true });
	const stem = options.fileStem ?? "output";
	const stamp = Math.floor((options.now ?? Date.now)());
	for (let attempt = 1; attempt <= SPILL_NAME_ATTEMPTS; attempt += 1) {
		const name = attempt === 1 ? `${stem}-${stamp}.md` : `${stem}-${stamp}-${attempt}.md`;
		const target = join(dir, name);
		try {
			// wx：同名文件已存在就抛 EEXIST
			await writeFile(target, text, { encoding: "utf-8", flag: "wx" });
			return target;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
		}
	}
	throw new Error(`no free spill file name for ${stem}-${stamp}.md in ${dir}`);
}

/** 会话 id 直接当目录名；形状不对、"." / ".." 或没有会话就归到 unscoped。 */
function sessionSegment(sessionId: string | undefined): string {
	const usable =
		sessionId !== undefined &&
		sessionId !== "." &&
		sessionId !== ".." &&
		SESSION_SEGMENT.test(sessionId);
	return usable ? sessionId : UNSCOPED_SESSION;
}

/** 删掉 spill 根下超过 `maxAgeMs` 没动过的会话目录；扩展加载时跑一次，失败不影响启动。 */
export async function pruneSpillRoot(
	root: string,
	now: number = Date.now(),
	maxAgeMs: number = SPILL_MAX_AGE_MS,
): Promise<void> {
	let names: string[];
	try {
		names = await readdir(root);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
		throw error;
	}
	const cutoff = now - maxAgeMs;
	for (const name of names) {
		const path = join(root, name);
		const info = await stat(path).catch(() => undefined);
		if (info === undefined || !info.isDirectory() || info.mtimeMs >= cutoff) continue;
		await rm(path, { recursive: true, force: true }).catch(() => undefined);
	}
}

/** 只压上界：下界（1_000 / 50）由 config 层 clamp 保证；直接传 0 会落到宿主「首行超限」分支。 */
function clampToHost(value: number | null, hostLimit: number): number {
	return value === null ? hostLimit : Math.min(value, hostLimit);
}
