import { evaluate, executeScriptWithFallback } from "../input/debugger.js";
import { installPageHelpers } from "./helpers.js";

/** `data` 字段的字符上限。超了省略，让调用方改走截屏。 */
const DATA_LIMIT = 100;

const HELPERS = "globalThis.__piHelpers";

/**
 * 在页面 MAIN world 求值。辅助函数先注入，表达式再经 CDP 求值。
 * @param {object} params
 * @param {number} params.tabId 标签 id
 * @param {string} params.js 要执行的源码
 * @returns {Promise<{ value: unknown, note?: string }>} 结果值；`note` 是要转给模型的一行提示
 */
export async function evaluatePage({ tabId, js } = {}) {
	if (typeof js !== "string" || js.trim() === "")
		throw new Error("bad_args: js must be a non-empty string");
	await executeScriptWithFallback({
		tabId,
		func: installPageHelpers,
		world: "MAIN",
	});
	const value = unwrap(await run(tabId, js));
	return omitLongData(value);
}

/**
 * 先按表达式求值；页面报 SyntaxError 时改按语句体求值。
 * @returns {Promise<unknown>} 页面给的值
 */
async function run(tabId, js) {
	try {
		return await evaluate(tabId, wrap(js, false), { awaitPromise: true });
	} catch (error) {
		if (!/SyntaxError/.test(errorMessage(error))) throw error;
		return evaluate(tabId, wrap(js, true), { awaitPromise: true });
	}
}

/**
 * 包成顺带整形的一层。语句体里的返回值要自己写 `return`。
 * @param {string} js 要执行的源码
 * @param {boolean} statement 是否按语句体包
 * @returns {string} 送进 `Runtime.evaluate` 的表达式
 */
function wrap(js, statement) {
	const body = statement ? `(async () => { ${js} })()` : `(${js})`;
	return `(async () => ${HELPERS}.stringify(await ${body}))()`;
}

/**
 * 解开页面里的标记。
 * @param {unknown} value 页面给的值
 * @returns {unknown} 给调用方的值
 */
function unwrap(value) {
	if (!value || typeof value !== "object") return value;
	if (value.kind === "undefined") return undefined;
	if (value.kind === "rect")
		return {
			x: value.x,
			y: value.y,
			width: value.width,
			height: value.height,
		};
	if (value.kind === "error")
		throw new Error(`page_error: ${value.name}: ${value.message}`);
	return value;
}

/**
 * `data` 字段多是 base64 图片，超上限就省掉并给提示。
 * @param {unknown} value 解包后的值
 * @returns {{ value: unknown, note?: string }}
 */
function omitLongData(value) {
	if (!value || typeof value !== "object" || Array.isArray(value))
		return { value };
	const data = value.data;
	if (typeof data !== "string" || [...data].length <= DATA_LIMIT)
		return { value };
	const kept = { ...value };
	delete kept.data;
	return {
		value: kept,
		note: `data omitted (${[...data].length} chars); use chrome_vision to look at images`,
	};
}

function errorMessage(error) {
	return error instanceof Error ? error.message : String(error);
}
