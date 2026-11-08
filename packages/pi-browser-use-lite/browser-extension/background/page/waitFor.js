/** 等待：在后台按固定间隔探测页面，命中就返回等了多久。 */

import { evaluate } from "../input/debugger.js";

const INTERVAL_MS = 250;

/** 不给时限时的等待上限。 */
const DEFAULT_TIMEOUT_MS = 15_000;

/** 三种等待对象各自对应的探测表达式。 */
const PROBES = new Map([
	["selector", (value) => `!!document.querySelector(${JSON.stringify(value)})`],
	["expression", (value) => `!!(${value})`],
	[
		"text",
		(value) =>
			`document.body !== null && document.body.innerText.includes(${JSON.stringify(value)})`,
	],
]);

/**
 * 等到 `kind` 对应的条件成立。
 * @param {object} params
 * @param {number} params.tabId 标签 id
 * @param {string} params.kind 等待对象：`selector`、`expression` 或 `text`
 * @param {string} params.value 选择器、表达式或正文片段
 * @param {number} [params.timeoutMs] 等多久后放弃，默认 15 秒
 * @returns {Promise<{ waitedMs: number }>} 实际等了多久
 */
export async function waitFor({ tabId, kind, value, timeoutMs } = {}) {
	const probe = PROBES.get(kind);
	if (probe === undefined)
		throw new Error(
			`bad_args: kind must be selector, expression or text, got ${kind}`,
		);
	if (typeof value !== "string" || value === "")
		throw new Error("bad_args: value must be a non-empty string");
	const limit = timeoutMs ?? DEFAULT_TIMEOUT_MS;
	if (!Number.isInteger(limit) || limit <= 0)
		throw new Error(
			`bad_args: timeoutMs must be a positive integer, got ${limit}`,
		);

	const expression = probe(value);
	const startedAt = Date.now();
	for (;;) {
		if (await hit(tabId, expression))
			return { waitedMs: Date.now() - startedAt };
		const elapsed = Date.now() - startedAt;
		if (elapsed >= limit)
			throw new Error(
				`timeout: waiting for ${kind} ${value} timed out after ${limit}ms`,
			);
		await sleep(Math.min(INTERVAL_MS, limit - elapsed));
	}
}

async function hit(tabId, expression) {
	return (await evaluate(tabId, expression)) === true;
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
