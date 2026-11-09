/**
 * 策略插点：授权开关。
 * 状态只在内存，随会话结束清回未授权；判定不做 IO，也没有定时器。
 */

import type { ResolvedConfig } from "../config/index.ts";

/** 一次拒绝。字段形状与工具结果的 `details.error` 一致。 */
export interface PolicyDenial {
	class: "locked";
	message: string;
	hint: string;
}

const NOT_AUTHORIZED: PolicyDenial = {
	class: "locked",
	message: "browser control is locked",
	hint: "Run /chrome authorize on",
};

/** 会话内的授权状态。 */
export interface SessionPolicy {
	readonly authorized: boolean;
	/** 授权开关。只在内存，不落盘。 */
	authorize(on: boolean): void;
	/** 会话结束：授权回到未授权。 */
	endSession(): void;
	/** 插点：一次工具调用先过这里。放行返回 undefined，拒绝返回原因。 */
	check(): PolicyDenial | undefined;
}

/** 造一份会话策略。`authorizeOnStart` 为真时开局即授权。 */
export function createSessionPolicy(
	settings: ResolvedConfig["policy"],
): SessionPolicy {
	let authorized = settings.authorizeOnStart;
	return {
		get authorized() {
			return authorized;
		},
		authorize(on) {
			authorized = on;
		},
		endSession() {
			authorized = false;
		},
		check() {
			return authorized ? undefined : NOT_AUTHORIZED;
		},
	};
}
