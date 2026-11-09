import { Bridge } from "../../src/bridge/index.ts";
import { HOST_VERSION } from "../../src/config/index.ts";

/**
 * Node 的 fetch 拒绝访问这些端口，请求会直接报 `bad port`。
 * 系统从动态端口范围里分配的端口可能落在里面（Windows 上范围是 1024 起），
 * 所以端口是 0 时关掉重开一个。名单取自 undici 的 badPorts，
 * 只留可能出现在动态端口范围里的那些。
 */
const BLOCKED_PORTS = new Set([
	5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669, 6697, 10_080,
]);

/**
 * 起一座桥。`port` 传 0 时由系统分配，并避开 fetch 的禁止端口。
 * @param {{ port?: number, holdMs?: number }} [options]
 * @returns {Promise<Bridge>}
 */
export async function startBridge({
	port = 0,
	holdMs,
}: {
	port?: number;
	holdMs?: number;
} = {}): Promise<Bridge> {
	for (let attempt = 0; attempt < 20; attempt++) {
		const bridge = new Bridge({ port, holdMs, hostVersion: HOST_VERSION });
		await bridge.start();
		const assigned = Number(new URL(bridge.url).port);
		if (port !== 0 || !BLOCKED_PORTS.has(assigned)) return bridge;
		await bridge.stop();
	}
	throw new Error("could not get a port that node fetch accepts");
}
