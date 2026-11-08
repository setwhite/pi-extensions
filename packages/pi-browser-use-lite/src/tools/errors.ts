/**
 * 错误类别的唯一来源：SPEC-0001 错误表的 12 类、每类的 hint、以及从异常认出类别。
 * 桥会发出的 5 类 hint 取自 protocol/，这里只补其余 7 类。
 */

import { BridgeError, ERROR_HINTS } from "../protocol/index.ts";

/** SPEC-0001 错误表的 12 个类别。 */
export type ErrorClass =
	| "locked"
	| "bridge_unreachable"
	| "extension_missing"
	| "extension_version"
	| "no_target"
	| "tab_not_found"
	| "tab_ambiguous"
	| "bad_args"
	| "timeout"
	| "cdp_unavailable"
	| "page_error"
	| "aborted";

/** 一次失败的形状，与工具结果的 `details.error` 一致。 */
export interface ErrorInfo {
	class: ErrorClass;
	message: string;
	hint: string;
}

/** 每类的下一步。桥那 5 类来自 protocol/，其余 7 类在这里。 */
const HINTS: Record<ErrorClass, string> = {
	...ERROR_HINTS,
	locked: "Run /chrome authorize on",
	extension_missing: "load the unpacked extension, then run /chrome status",
	no_target: "run chrome_act navigate or chrome_tab new first",
	tab_not_found: "run chrome_tab list to see the tab ids",
	tab_ambiguous: "pass a longer match or a tab id from chrome_tab list",
	bad_args: "add the missing argument and retry",
	cdp_unavailable: "close DevTools or the other debugger on that tab",
};

/** 用类别与原因造一条失败，hint 从表里取。 */
export function errorInfo(errorClass: ErrorClass, message: string): ErrorInfo {
	return { class: errorClass, message, hint: HINTS[errorClass] };
}

/**
 * 把任意异常认成一条失败。
 * 认的顺序：桥的错 → 消息以 `<class>: ` 开头 → 其余归 `page_error`。
 */
export function classify(cause: unknown): ErrorInfo {
	if (cause instanceof BridgeError) {
		const error = cause.details.error;
		return { class: error.class, message: error.message, hint: error.hint };
	}
	const message = cause instanceof Error ? cause.message : String(cause);
	const match = /^([a-z_]+): (.*)$/s.exec(message);
	if (match !== null && isErrorClass(match[1])) {
		return errorInfo(match[1], match[2]);
	}
	return errorInfo("page_error", message);
}

function isErrorClass(value: string): value is ErrorClass {
	return value in HINTS;
}
