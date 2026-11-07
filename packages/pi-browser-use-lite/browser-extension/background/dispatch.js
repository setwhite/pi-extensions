/** 动作路由表。键与 src/protocol 的动作名一致。 */
const routes = {
	/** 握手：报出扩展版本，宿主拿它和包版本比。 */
	"tab.version": () => ({
		extensionVersion: chrome.runtime.getManifest().version,
	}),
};

/**
 * 路由一条命令。
 * @param {string} action 动作名
 * @param {Record<string, unknown>} [params] 动作参数
 * @returns {unknown} 动作的结果
 */
export function dispatch(action, params) {
	const route = routes[action];
	if (route === undefined) throw new Error(`Unknown action: ${action}`);
	return route(params);
}
