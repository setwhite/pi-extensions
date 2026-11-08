/**
 * 策略插点：授权开关与硬背景模式。
 * 状态只在内存，随会话结束清回默认；判定不做 IO，也没有定时器。
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

/** 聚焦动作名。工具名可被 config 改名，动作名不会，所以按动作名判。 */
const FOCUS_ACTION = "switch";

const FOCUS_BLOCKED: PolicyDenial = {
	class: "locked",
	message: "background mode blocks tab switch",
	hint: "Run /chrome background off",
};

/** 会话内的授权与背景模式状态。 */
export interface SessionPolicy {
	readonly authorized: boolean;
	readonly background: boolean;
	/** 授权开关。只在内存，不落盘。 */
	authorize(on: boolean): void;
	/** 背景模式开关。开启时不接受任何聚焦请求。 */
	setBackground(on: boolean): void;
	/** 会话结束：授权回到未授权，背景模式回到配置默认值。 */
	endSession(): void;
	/** 插点：一次工具调用先过这里。放行返回 undefined，拒绝返回原因。 */
	check(action?: string): PolicyDenial | undefined;
}

/** 造一份会话策略。`authorizeOnStart` 为真时开局即授权。 */
export function createSessionPolicy(
	settings: ResolvedConfig["policy"],
): SessionPolicy {
	let authorized = settings.authorizeOnStart;
	let background = settings.background;
	return {
		get authorized() {
			return authorized;
		},
		get background() {
			return background;
		},
		authorize(on) {
			authorized = on;
		},
		setBackground(on) {
			background = on;
		},
		endSession() {
			authorized = false;
			background = settings.background;
		},
		check(action = "") {
			if (!authorized) return NOT_AUTHORIZED;
			if (background && action === FOCUS_ACTION) return FOCUS_BLOCKED;
			return undefined;
		},
	};
}
