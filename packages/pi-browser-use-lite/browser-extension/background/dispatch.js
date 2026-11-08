/**
 * 动作路由表：动作名 → 处理函数。键与 src/protocol 的 `ACTION_NAMES` 一致。
 *
 * 用 Map 而不是对象：动作名来自命令，对象查表会命中原型链上的名字（`toString` 等）。
 * 值仍是 `undefined` 的动作还没接实现：表里留键，接线在 T25 统一做。
 */
export const routes = new Map([
	[
		"tab.version",
		() => ({ extensionVersion: chrome.runtime.getManifest().version }),
	],
	["tab.list", undefined],
	["tab.new", undefined],
	["tab.activate", undefined],
	["tab.close", undefined],
	["tab.group", undefined],
	["page.navigate", undefined],
	["page.snapshot", undefined],
	["page.inspect", undefined],
	["page.evaluate", undefined],
	["page.click", undefined],
	["page.hover", undefined],
	["page.drag", undefined],
	["page.upload", undefined],
	["page.type", undefined],
	["page.fill", undefined],
	["page.key", undefined],
	["page.scroll", undefined],
	["page.waitFor", undefined],
	["page.screenshot", undefined],
	["page.console.list", undefined],
	["page.network.list", undefined],
	["page.network.get", undefined],
	["cdp.call", undefined],
	["automation.cleanup", undefined],
]);

/**
 * 路由一条命令。
 * 动作名不在表里抛 `Unknown action: …`；在表里但实现没接抛 `… is not wired yet`。
 * @param {string} action 动作名
 * @param {Record<string, unknown>} [params] 动作参数
 * @returns {unknown} 动作的结果
 */
export function dispatch(action, params) {
	if (!routes.has(action)) throw new Error(`Unknown action: ${action}`);
	const route = routes.get(action);
	if (route === undefined) throw new Error(`${action} is not wired yet`);
	return route(params);
}
