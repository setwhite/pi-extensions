import { afterEach, expect, it, vi } from "vitest";
import { Bridge } from "../../../src/bridge/index.ts";
import { DEFAULTS } from "../../../src/config/index.ts";
import piBrowserUseLite from "../../../src/index.ts";
import {
	cleanupConfig,
	fakeApi,
	notifyMock,
	useConfig,
} from "../../helpers/extension-api.ts";

afterEach(() => {
	vi.restoreAllMocks();
	notifyMock.mockClear();
	cleanupConfig();
});

it("AC14: 会话结束时按 closeOwnTabsOnExit 发 automation.cleanup", async () => {
	const send = vi.spyOn(Bridge.prototype, "send").mockResolvedValue(undefined);
	useConfig();
	const { api, shutdown } = fakeApi();
	piBrowserUseLite(api);

	await shutdown();

	expect(send).toHaveBeenCalledWith(
		"automation.cleanup",
		{ sessionKey: "s1", closeOwnTabs: DEFAULTS.policy.closeOwnTabsOnExit },
		{ timeoutMs: 5_000 },
	);
});

it("AC14: closeOwnTabsOnExit 为 false 时关进参数", async () => {
	const send = vi.spyOn(Bridge.prototype, "send").mockResolvedValue(undefined);
	useConfig({ policy: { closeOwnTabsOnExit: false } });
	const { api, shutdown } = fakeApi();
	piBrowserUseLite(api);

	await shutdown();

	expect(send).toHaveBeenCalledWith(
		"automation.cleanup",
		{ sessionKey: "s1", closeOwnTabs: false },
		{ timeoutMs: 5_000 },
	);
});

it("AC14: 清理失败要对用户说出来，不吞", async () => {
	vi.spyOn(Bridge.prototype, "send").mockRejectedValue(
		new Error("bridge_unreachable: the bridge is not running (stopped)"),
	);
	useConfig();
	const { api, shutdown } = fakeApi();
	piBrowserUseLite(api);

	await shutdown();

	expect(notifyMock).toHaveBeenCalledWith(
		"could not clean up the automation tabs: bridge_unreachable: the bridge is not running (stopped)",
		"warning",
	);
});
