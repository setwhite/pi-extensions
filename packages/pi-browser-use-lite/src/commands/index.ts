/**
 * `/chrome` 命令：authorize、background、status 三个子命令。
 * 命令只改会话状态与读桥的状态，不发浏览器命令；子命令文本由 {@link ChromeCommand.run} 返回。
 */

import { fileURLToPath } from "node:url";
import type { Bridge } from "../bridge/index.ts";
import type { SessionPolicy } from "../policy/index.ts";

/** 命令层用到的桥：起桥与问真实状态。桩只要这两个方法。 */
export type ChromeBridge = Pick<Bridge, "start" | "describe">;

export interface ChromeCommandDeps {
	policy: SessionPolicy;
	bridge: ChromeBridge;
	/** 宿主版本，用 `HOST_VERSION`。 */
	hostVersion: string;
	/** 本会话的自动化 target。宿主没记过时返回 undefined。 */
	targetId?: () => number | undefined;
}

export interface ChromeCommand {
	/** 跑一条子命令，返回要打印的文本。 */
	run(args: string): Promise<string>;
}

/** 装扩展的三步。`extension_missing` 与 status 未连上时都打印它。 */
const INSTALL_STEPS = [
	"hint: load the unpacked extension, then run /chrome status again",
	"1. open chrome://extensions and turn on Developer mode",
	`2. click Load unpacked and pick ${fileURLToPath(new URL("../../browser-extension/", import.meta.url))}`,
	"3. leave the extension enabled; it polls the bridge by itself",
].join("\n");

const SUBCOMMANDS = [
	"/chrome authorize on|off",
	"/chrome background on|off",
	"/chrome status",
].join("\n");

export function createChromeCommand(deps: ChromeCommandDeps): ChromeCommand {
	return {
		run: async (args) => {
			const trimmed = args.trim();
			if (trimmed === "") return SUBCOMMANDS;
			const [verb, value] = trimmed.split(/\s+/);
			if (verb === "authorize") return toggleAuthorize(deps, value);
			if (verb === "background") return toggleBackground(deps, value);
			if (verb === "status") return statusOf(deps);
			return `bad_args: unknown subcommand: ${trimmed}\nhint: run /chrome for the list`;
		},
	};
}

/** 授权只在扩展连上以后才开：桥通了才算有可控的浏览器。 */
async function toggleAuthorize(
	deps: ChromeCommandDeps,
	value: string | undefined,
): Promise<string> {
	const on = flagOf(value);
	if (on === undefined) return usage("authorize on|off");
	if (!on) {
		deps.policy.authorize(false);
		return "authorized: off";
	}

	await deps.bridge.start();
	if (!(await deps.bridge.describe()).connected)
		return `extension_missing: the browser extension is not connected\n${INSTALL_STEPS}`;
	deps.policy.authorize(true);
	return "authorized: on";
}

function toggleBackground(
	deps: ChromeCommandDeps,
	value: string | undefined,
): string {
	const on = flagOf(value);
	if (on === undefined) return usage("background on|off");
	deps.policy.setBackground(on);
	return `background: ${on ? "on" : "off"}`;
}

/** 状态行：桥的四项来自 `bridge.status()`，策略两项来自会话，target 来自宿主会话状态。 */
async function statusOf(deps: ChromeCommandDeps): Promise<string> {
	await deps.bridge.start();
	const bridge = await deps.bridge.describe();
	const target = deps.targetId?.();
	const lines = [
		`host: ${deps.hostVersion}`,
		`extension: ${bridge.extensionVersion ?? "not connected"}`,
		`authorized: ${deps.policy.authorized ? "on" : "off"}`,
		`background: ${deps.policy.background ? "on" : "off"}`,
		`bridge: ${bridge.mode}`,
		`port: ${new URL(bridge.url).port}`,
		`connected: ${bridge.connected ? "yes" : "no"}`,
		`queued: ${bridge.queuedCommands}`,
		`target: ${target ?? "none"}`,
	];
	if (!bridge.connected) lines.push(INSTALL_STEPS);
	return lines.join("\n");
}

function flagOf(value: string | undefined): boolean | undefined {
	if (value === "on") return true;
	if (value === "off") return false;
	return undefined;
}

function usage(usage: string): string {
	return `bad_args: expected /chrome ${usage}\nhint: run /chrome for the list`;
}
