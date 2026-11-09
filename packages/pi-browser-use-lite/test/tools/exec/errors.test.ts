import { expect, it } from "vitest";
import { BridgeError } from "../../../src/protocol/index.ts";
import {
	classify,
	type ErrorClass,
	errorInfo,
} from "../../../src/tools/errors.ts";
import {
	CONTENT_LIMIT,
	errorResult,
	okResult,
} from "../../../src/tools/result.ts";

const CLASSES: ErrorClass[] = [
	"locked",
	"bridge_unreachable",
	"extension_missing",
	"extension_version",
	"no_target",
	"tab_not_found",
	"tab_ambiguous",
	"bad_args",
	"timeout",
	"cdp_unavailable",
	"page_error",
	"aborted",
];

it("AC12: 12 个类别逐个有 details.error.class 与非空 hint", () => {
	for (const errorClass of CLASSES) {
		const result = errorResult(errorInfo(errorClass, "something failed"));

		expect(result.details?.error).toMatchObject({ class: errorClass });
		expect((result.details as { error: { hint: string } }).error.hint).not.toBe(
			"",
		);
		expect(result.isError).toBe(true);
	}
});

it("AC12: 扩展回报的 <class>: 前缀被认出来", () => {
	const info = classify(
		new Error("no_target: no automation target for session s1"),
	);

	expect(info).toMatchObject({
		class: "no_target",
		message: "no automation target for session s1",
	});
});

it("AC12: 没写类别的错误归 page_error", () => {
	expect(classify(new Error("the tab never loaded"))).toMatchObject({
		class: "page_error",
		message: "the tab never loaded",
	});
});

it("AC12: 桥的错误类别与 hint 原样透传", () => {
	const info = classify(new BridgeError("timeout", "the tab never loaded"));

	expect(info).toStrictEqual({
		class: "timeout",
		message: "the tab never loaded",
		hint: "Run /chrome status",
	});
});

it("AC6: 超过 32,000 字符时截断并在末尾注明", () => {
	const long = "x".repeat(CONTENT_LIMIT + 500);
	const result = okResult(long, {});

	const text = (result.content[0] as { text: string }).text;
	const note = /\n\[truncated: (\d+) characters dropped\]$/.exec(text);
	expect(text.length).toBeLessThanOrEqual(CONTENT_LIMIT);
	expect(note).not.toBeNull();
	// 注明丢掉的字符数加上留下的字符数，等于原文本的长度：一位不差。
	const kept = text.length - (note?.[0].length ?? 0);
	expect(kept + Number(note?.[1])).toBe(long.length);
	expect(text.startsWith(long.slice(0, kept))).toBe(true);
	expect(result.details?.truncated).toBe(true);
});

it("AC6: 没超限时不加 truncated", () => {
	const result = okResult("short", { a: 1 });

	expect(result.details).toStrictEqual({ a: 1 });
	expect(result.content[0]).toStrictEqual({ type: "text", text: "short" });
});
