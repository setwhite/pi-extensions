import { afterEach, expect, it, vi } from "vitest";
import { createChromeCommand } from "../../src/commands/index.ts";
import { DEFAULTS, HOST_VERSION } from "../../src/config/index.ts";
import piBrowserUseLite from "../../src/index.ts";
import { createSessionPolicy } from "../../src/policy/index.ts";
import { cleanupConfig, fakeApi, useConfig } from "../helpers/extension-api.ts";

afterEach(cleanupConfig);

type BridgeStatus = ReturnType<
	import("../../src/bridge/index.ts").Bridge["status"]
>;

/** 桥桩：默认连着扩展；`send` 一被调用就让用例红，命令层不该发浏览器命令。 */
function fakeBridge(status: Partial<BridgeStatus> = {}) {
	return {
		start: vi.fn(async () => undefined),
		describe: vi.fn(
			async () =>
				({
					mode: "server",
					url: "http://127.0.0.1:17318",
					connected: true,
					queuedCommands: 0,
					pendingCommands: 0,
					...status,
				}) as BridgeStatus,
		),
		send: vi.fn(() => {
			throw new Error("the command layer must not send browser commands");
		}),
	};
}

function commandOf(
	bridge: ReturnType<typeof fakeBridge>,
	options: { targetId?: () => number | undefined } = {},
) {
	const policy = createSessionPolicy(DEFAULTS.policy);
	return {
		policy,
		run: (args: string) =>
			createChromeCommand({
				policy,
				bridge,
				hostVersion: HOST_VERSION,
				...options,
			}).run(args),
	};
}

it("AC2: 不带参数时列出 3 个子命令，不含 doctor 与 onboard", async () => {
	const { run } = commandOf(fakeBridge());

	const text = await run("");

	expect(text).toContain("/chrome authorize on|off");
	expect(text).toContain("/chrome background on|off");
	expect(text).toContain("/chrome status");
	expect(text).not.toContain("doctor");
	expect(text).not.toContain("onboard");
});

it("AC2: 认不出的子命令给出报错与出路", async () => {
	const { run } = commandOf(fakeBridge());

	const text = await run("doctor");

	expect(text.split("\n")[0]).toBe("bad_args: unknown subcommand: doctor");
	expect(text).toContain("hint: run /chrome for the list");
});

it("AC5: status 报 8 项", async () => {
	const { run } = commandOf(
		fakeBridge({ extensionVersion: "0.1.0", queuedCommands: 2 }),
		{ targetId: () => 42 },
	);

	const text = await run("status");

	expect(text).toContain(`host: ${HOST_VERSION}`);
	expect(text).toContain("authorized: off");
	expect(text).toContain("background: on");
	expect(text).toContain("bridge: server");
	expect(text).toContain("port: 17318");
	expect(text).toContain("connected: yes");
	expect(text).toContain("queued: 2");
	expect(text).toContain("extension: 0.1.0");
	expect(text).toContain("target: 42");
});

it("AC5: status 不探测页面时 target 与扩展版本都说没有", async () => {
	const { run } = commandOf(fakeBridge({ connected: false }));

	const text = await run("status");

	expect(text).toContain("connected: no");
	expect(text).toContain("extension: not connected");
	expect(text).toContain("target: none");
});

it("AC3: 桥未连上时 status 打印装扩展的三步", async () => {
	const { run } = commandOf(fakeBridge({ connected: false }));

	const text = await run("status");

	expect(text).toContain("hint: load the unpacked extension");
	expect(text).toContain("chrome://extensions");
	expect(text).toContain("Load unpacked");
	expect(text).toContain("browser-extension");
});

it("AC3: 未连上时 authorize on 打印同样的三步且不授权", async () => {
	const bridge = fakeBridge({ connected: false });
	const { policy, run } = commandOf(bridge);

	const on = await run("authorize on");
	const status = await run("status");

	expect(on).toContain(
		"extension_missing: the browser extension is not connected",
	);
	expect(on).toContain("Load unpacked");
	expect(status).toContain("Load unpacked");
	expect(policy.authorized).toBe(false);
});

it("AC3: 连上以后 authorize on 打开授权，off 立刻关掉", async () => {
	const { policy, run } = commandOf(fakeBridge());

	expect(await run("authorize on")).toBe("authorized: on");
	expect(policy.authorized).toBe(true);
	expect(await run("authorize off")).toBe("authorized: off");
	expect(policy.authorized).toBe(false);
});

it("AC3: 参数不对时给用法，不改状态", async () => {
	const { policy, run } = commandOf(fakeBridge());

	expect(await run("authorize")).toContain(
		"bad_args: expected /chrome authorize on|off",
	);
	expect(await run("background maybe")).toContain(
		"bad_args: expected /chrome background on|off",
	);
	expect(policy.authorized).toBe(false);
	expect(policy.background).toBe(DEFAULTS.policy.background);
});

it("AC6: background on 与 off 改会话状态，status 反映它", async () => {
	const { policy, run } = commandOf(fakeBridge());

	expect(await run("background off")).toBe("background: off");
	expect(await run("status")).toContain("background: off");
	expect(policy.background).toBe(false);

	expect(await run("background on")).toBe("background: on");
	expect(await run("status")).toContain("background: on");
	expect(policy.background).toBe(true);
});

it("client 模式下也能授权，status 报 client", async () => {
	const { policy, run } = commandOf(fakeBridge({ mode: "client" }));

	expect(await run("authorize on")).toBe("authorized: on");
	expect(policy.authorized).toBe(true);
	expect(await run("status")).toContain("bridge: client");
});

it("AC4: 三个子命令都不发浏览器命令", async () => {
	const bridge = fakeBridge();
	const { run } = commandOf(bridge);

	for (const args of ["", "status", "authorize on", "background off"]) {
		await run(args);
	}

	expect(bridge.send).not.toHaveBeenCalled();
});

it("入口: /chrome 注册进扩展，打印走 ui.notify", async () => {
	useConfig();
	const { api, runCommand } = fakeApi();
	piBrowserUseLite(api);

	const text = await runCommand("chrome", "");

	expect(text).toBe(
		[
			"/chrome authorize on|off",
			"/chrome background on|off",
			"/chrome status",
		].join("\n"),
	);
});

it("AC5: status 先起桥再读状态", async () => {
	const bridge = fakeBridge();
	const { run } = commandOf(bridge);

	await run("status");

	expect(bridge.start).toHaveBeenCalledTimes(1);
	expect(bridge.describe).toHaveBeenCalledTimes(1);
});
