/**
 * 从异常认出错误类别。类别表与 hint 在 protocol/，这里只做识别。
 * 消息前缀 `<class>: ` 是本包内部的约定：fs/ 这类叶子模块抛不出带类型的错误。
 */

import {
	BridgeError,
	ERROR_HINTS,
	type ErrorClass,
	isErrorClass,
} from "../protocol/index.ts";

export type { ErrorClass };

/** 一次失败的形状，与工具结果的 `details.error` 一致。 */
export interface ErrorInfo {
	class: ErrorClass;
	message: string;
	hint: string;
}

/** 用类别与原因造一条失败，hint 从表里取。 */
export function errorInfo(errorClass: ErrorClass, message: string): ErrorInfo {
	return { class: errorClass, message, hint: ERROR_HINTS[errorClass] };
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
