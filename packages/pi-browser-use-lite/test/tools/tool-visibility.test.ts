import { afterEach, beforeEach, expect, it, vi } from "vitest";
import piBrowserUseLite from "../../src/index.ts";
import {
	cleanupConfig,
	fakeApi,
	stubBridge,
	useConfig,
} from "../helpers/extension-api.ts";

// `/chrome authorize on` 只在本机装了扩展、桥报 connected 时才授权，用例不依赖本机。
beforeEach(() => stubBridge({ connected: true }));

afterEach(() => {
	cleanupConfig();
	vi.restoreAllMocks();
});

const ALL = [
	"chrome_act",
	"chrome_see",
	"chrome_tab",
	"chrome_vision",
	"chrome_cdp",
];

it("AC1: 未授权启动时 5 个工具都注册为不活动", () => {
	const { api, registered, activeTools } = fakeApi();
	piBrowserUseLite(api);

	expect(
		registered.map((tool) => [tool.name, tool.defaultActive]),
	).toStrictEqual(ALL.map((name) => [name, false]));
	expect(activeTools).toStrictEqual([]);
});

it("AC2: authorizeOnStart 为 true 时工具一启动就活动", () => {
	useConfig({ policy: { authorizeOnStart: true } });
	const { api, registered, activeTools } = fakeApi();
	piBrowserUseLite(api);

	expect(registered.every((tool) => tool.defaultActive === true)).toBe(true);
	expect(activeTools).toStrictEqual(ALL);
});

it("AC3: authorize on 挂上工具，off 摘掉", async () => {
	const { api, activeTools, runCommand } = fakeApi();
	piBrowserUseLite(api);

	await runCommand("chrome", "authorize on");
	expect(activeTools).toStrictEqual(ALL);

	await runCommand("chrome", "authorize off");
	expect(activeTools).toStrictEqual([]);
});

it("AC4: 配置里关掉的工具不会被 authorize on 加回来", async () => {
	useConfig({ tools: { chrome_cdp: { enabled: false } } });
	const { api, activeTools, runCommand } = fakeApi();
	piBrowserUseLite(api);

	await runCommand("chrome", "authorize on");

	expect(activeTools).toStrictEqual(
		ALL.filter((name) => name !== "chrome_cdp"),
	);
});

it("AC5: 改名后按新名字挂上", async () => {
	useConfig({ tools: { chrome_act: { name: "chrome_click" } } });
	const { api, activeTools, runCommand } = fakeApi();
	piBrowserUseLite(api);

	await runCommand("chrome", "authorize on");

	expect(activeTools).toContain("chrome_click");
	expect(activeTools).not.toContain("chrome_act");
});

it("AC6: authorize off 只摘本包的工具，别的工具留着", async () => {
	const { api, activeTools, runCommand } = fakeApi();
	piBrowserUseLite(api);
	api.setActiveTools(["read", "bash", ...ALL]);

	await runCommand("chrome", "authorize off");

	expect(activeTools).toStrictEqual(["read", "bash"]);
});
