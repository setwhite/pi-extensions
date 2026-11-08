import { readFileSync } from "node:fs";
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

const LOCKED: PolicyDenial = {
	class: "locked",
	message: "browser control is locked",
	hint: "Run /chrome authorize on",
};

it("AC2: 未授权时 5 个工具逐个都返回 locked，执行器没跑", async () => {
	useConfig();
	const { api, registered } = fakeApi();
	stubBridge();
	piBrowserUseLite(api);

	expect(registered).toHaveLength(5);
	for (const tool of registered) {
		const result = await callTool(tool);
		// 执行器只要跑了就会是执行器的文案（桥没起报 extension_missing），这里必须是策略的。
		expect(result.content).toStrictEqual([
			{
				type: "text",
				text: "locked: browser control is locked\nhint: Run /chrome authorize on",
			},
		]);
		expect(result.details).toStrictEqual({ error: LOCKED });
		expect(result.isError).toBe(true);
	}
});

it("AC3: 授权打开后放行，关掉后同一调用立即被拒", async () => {
	useConfig({ policy: { authorizeOnStart: true } });
	const { api, registered } = fakeApi();
	stubBridge();
	piBrowserUseLite(api);

	// 放行后走到执行器：桥还没起，执行器报扩展没连上，说明策略没挡。
	const allowed = await callTool(registered[0]);
	expect(JSON.stringify(allowed.content)).not.toContain("locked:");

	const policy = createSessionPolicy(DEFAULTS.policy);
	expect(policy.check()).toStrictEqual(LOCKED);
	policy.authorize(true);
	expect(policy.check()).toBeUndefined();
	policy.authorize(false);
	expect(policy.check()).toStrictEqual(LOCKED);
});

it("AC5: 会话结束回调后授权回到未授权，源码里没有定时器", async () => {
	useConfig({ policy: { authorizeOnStart: true } });
	const { api, registered, shutdown } = fakeApi();
	stubBridge();
	piBrowserUseLite(api);

	const before = await callTool(registered[0]);
	expect(JSON.stringify(before.content)).not.toContain("locked:");
	await shutdown();
	const result = await callTool(registered[0]);
	expect(result.details).toStrictEqual({ error: LOCKED });

	const policy = createSessionPolicy({
		...DEFAULTS.policy,
		authorizeOnStart: true,
	});
	policy.endSession();
	expect(policy.authorized).toBe(false);

	const sources = ["../../src/policy/index.ts", "../../src/index.ts"].map(
		(path) => readFileSync(new URL(path, import.meta.url), "utf8"),
	);
	expect(sources.join("\n")).not.toMatch(
		/setTimeout|setInterval|setImmediate|queueMicrotask/,
	);
});

it("AC6: policy.authorizeOnStart 为真时加载后不经任何命令即可调用", async () => {
	useConfig({ policy: { authorizeOnStart: true } });
	const { api, registered } = fakeApi();
	stubBridge();
	piBrowserUseLite(api);

	for (const tool of registered) {
		const result = await callTool(tool);
		expect(JSON.stringify(result.content)).not.toContain("locked:");
	}
});
