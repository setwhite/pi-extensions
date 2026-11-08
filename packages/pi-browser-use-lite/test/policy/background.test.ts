import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { afterEach, expect, it, vi } from "vitest";
import { DEFAULTS } from "../../src/config/index.ts";
import piBrowserUseLite from "../../src/index.ts";
import {
	createSessionPolicy,
	type PolicyDenial,
} from "../../src/policy/index.ts";
import {
	callTool,
	cleanupConfig,
	fakeApi,
	stubBridge,
	useConfig,
} from "../helpers/extension-api.ts";

afterEach(() => {
	vi.restoreAllMocks();
	cleanupConfig();
});

const FOCUS_BLOCKED: PolicyDenial = {
	class: "locked",
	message: "background mode blocks tab switch",
	hint: "Run /chrome background off",
};

it("AC4: 背景模式开着时 chrome_tab 的 switch 被拒，参数无从覆盖", async () => {
	useConfig({ policy: { authorizeOnStart: true } });
	const { api, registered } = fakeApi();
	stubBridge();
	piBrowserUseLite(api);
	const tab = registered.find((tool) => tool.name === "chrome_tab");
	expect(tab).toBeDefined();
	const tabTool = tab as ToolDefinition;

	const result = await callTool(tabTool, { action: "switch", tab: "tab-1" });
	expect(result.content).toStrictEqual([
		{
			type: "text",
			text: "locked: background mode blocks tab switch\nhint: Run /chrome background off",
		},
	]);
	expect(result.details).toStrictEqual({ error: FOCUS_BLOCKED });
	expect(result.isError).toBe(true);

	// 塞别的参数也绕不过：判定只看动作名。
	const withExtra = await callTool(tabTool, {
		action: "switch",
		background: false,
	});
	expect(withExtra.details).toStrictEqual({ error: FOCUS_BLOCKED });

	// 别的标签页动作照旧放行到执行器：桥的桩报未连上，说明没被策略挡。
	const allowed = await callTool(tabTool, { action: "list" });
	expect(JSON.stringify(allowed.content)).toContain("extension_missing:");
});

it("判定只看动作名：背景关时 switch 放行，其它动作不受管", () => {
	const policy = createSessionPolicy({ ...DEFAULTS.policy, background: false });
	policy.authorize(true);
	expect(policy.check("switch")).toBeUndefined();

	policy.setBackground(true);
	expect(policy.check("switch")).toStrictEqual(FOCUS_BLOCKED);
	for (const action of ["list", "new", "navigate", "close"])
		expect(policy.check(action)).toBeUndefined();
});

it("未授权时授权锁定优先，背景规则不抢答", () => {
	const policy = createSessionPolicy(DEFAULTS.policy);
	expect(policy.check("switch")).toStrictEqual({
		class: "locked",
		message: "browser control is locked",
		hint: "Run /chrome authorize on",
	});
});

it("endSession 把背景模式回到配置默认值", () => {
	const policy = createSessionPolicy({ ...DEFAULTS.policy, background: false });
	policy.setBackground(true);
	expect(policy.background).toBe(true);

	policy.endSession();
	expect(policy.background).toBe(false);
});
