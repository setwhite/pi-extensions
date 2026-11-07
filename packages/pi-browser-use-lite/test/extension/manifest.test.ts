import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

const EXTENSION_DIR = fileURLToPath(
	new URL("../../browser-extension/", import.meta.url),
);

interface Manifest {
	version: string;
	background: { service_worker: string; type?: string };
	permissions: string[];
	host_permissions: string[];
}

function readManifest(): Manifest {
	return JSON.parse(
		readFileSync(join(EXTENSION_DIR, "manifest.json"), "utf8"),
	) as Manifest;
}

interface ChromeStub {
	runtime: {
		onInstalled: { addListener: ReturnType<typeof vi.fn> };
		onStartup: { addListener: ReturnType<typeof vi.fn> };
	};
	alarms: {
		create: ReturnType<typeof vi.fn>;
		onAlarm: { addListener: ReturnType<typeof vi.fn> };
	};
}

/** 挂一个只记账的 chrome 桩，供 background 模块加载时用。 */
function stubChrome(): ChromeStub {
	const stub: ChromeStub = {
		runtime: {
			onInstalled: { addListener: vi.fn() },
			onStartup: { addListener: vi.fn() },
		},
		alarms: { create: vi.fn(), onAlarm: { addListener: vi.fn() } },
	};
	(globalThis as { chrome?: unknown }).chrome = stub;
	return stub;
}

afterEach(() => {
	delete (globalThis as { chrome?: unknown }).chrome;
	vi.restoreAllMocks();
});

describe("扩展清单", () => {
	it("AC2: background 以 ES module 加载 index.js", () => {
		const manifest = readManifest();

		expect(manifest.background.type).toBe("module");
		expect(manifest.background.service_worker).toBe("background/index.js");
	});

	it("AC3: permissions 含七个必需权限", () => {
		expect(readManifest().permissions).toEqual(
			expect.arrayContaining([
				"debugger",
				"scripting",
				"tabs",
				"tabGroups",
				"storage",
				"alarms",
				"webNavigation",
			]),
		);
	});

	it("manifest 版本与 package.json 一致，握手才比得出版本不匹配", () => {
		const manifest = readManifest();
		const pkg = JSON.parse(
			readFileSync(join(EXTENSION_DIR, "..", "package.json"), "utf8"),
		) as { version: string };

		expect(manifest.version).toBe(pkg.version);
	});

	it("AC4: host_permissions 覆盖桥的默认端口 17318，且不写死端口", () => {
		const patterns = readManifest().host_permissions;

		// 不写端口就匹配全部端口，bridge.port 改了也不用重装扩展。
		expect(patterns).toContain("http://127.0.0.1/*");
		for (const pattern of patterns)
			expect(pattern).not.toMatch(/^http:\/\/127\.0\.0\.1:\d+/);
	});
});

describe("background 入口", () => {
	it("AC5: 挂 chrome 桩后能加载，并注册了 chrome.alarms.onAlarm", async () => {
		const chrome = stubChrome();

		const entry = new URL(
			"../../browser-extension/background/index.js",
			import.meta.url,
		);
		await expect(import(entry.href)).resolves.toBeDefined();

		expect(chrome.alarms.onAlarm.addListener).toHaveBeenCalledTimes(1);

		// 唤醒后把 alarm 续上，service worker 下次还能再醒。
		const listener = chrome.alarms.onAlarm.addListener.mock.calls[0]?.[0] as
			| ((alarm: { name: string }) => void)
			| undefined;
		if (listener === undefined) throw new Error("no alarm listener");
		chrome.alarms.create.mockClear();
		listener({ name: "pi-browser-use:poll" });
		expect(chrome.alarms.create).toHaveBeenCalledTimes(1);
	});
});
