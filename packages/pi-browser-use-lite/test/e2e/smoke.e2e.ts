/**
 * 真浏览器冒烟：连一个已开着、已装好扩展的浏览器，跑导航、点击、截屏。
 * 为什么这么跑见 docs/ARCHITECTURE.md §3。
 */

import { readFile, stat } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, expect, it } from "vitest";
import { Bridge } from "../../src/bridge/index.ts";
import { INSTALL_STEPS } from "../../src/commands/index.ts";
import { agentDir, HOST_VERSION, loadConfig } from "../../src/config/index.ts";
import {
	createExecutors,
	type Executors,
	type SessionTarget,
} from "../../src/tools/exec/index.ts";
import type { ToolResult } from "../../src/tools/result.ts";

const FIXTURES = fileURLToPath(new URL("./fixtures/", import.meta.url));
const SESSION = "e2e-smoke";
/** 等扩展醒来的时限：要跨过一个 alarm 周期，周期长度见 docs/specs/0001-tool-surface.md。 */
const CONNECT_TIMEOUT_MS = 90_000;

const TYPES = new Map([
	[".html", "text/html; charset=utf-8"],
	[".css", "text/css; charset=utf-8"],
	[".js", "text/javascript; charset=utf-8"],
]);

let server: Server;
let origin: string;
let bridge: Bridge;
let executors: Executors;
let extensionReady: Promise<void> | undefined;

beforeAll(async () => {
	server = createServer(async (request, response) => {
		const name =
			(request.url ?? "/") === "/"
				? "01-is-trusted-click.html"
				: (request.url ?? "").slice(1);
		const file = resolve(join(FIXTURES, name));
		if (!file.startsWith(FIXTURES)) {
			response.writeHead(404);
			response.end();
			return;
		}
		try {
			const body = await readFile(file);
			response.writeHead(200, {
				"content-type": TYPES.get(extname(name)) ?? "application/octet-stream",
			});
			response.end(body);
		} catch {
			response.writeHead(404);
			response.end();
		}
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

	const config = loadConfig(agentDir());
	bridge = new Bridge({ port: config.bridge.port, hostVersion: HOST_VERSION });
	await bridge.start();
	let target: number | undefined;
	const sessionTarget: SessionTarget = {
		get: () => target,
		set: (id) => {
			target = id;
		},
	};
	executors = createExecutors({ bridge, config, target: sessionTarget });
});

afterAll(async () => {
	if (bridge !== undefined) {
		try {
			await bridge.send(
				"automation.cleanup",
				{ sessionKey: SESSION, closeOwnTabs: true },
				{ timeoutMs: 5_000 },
			);
		} catch (cause) {
			console.warn("e2e: could not close the automation tab:", cause);
		}
		await bridge.stop();
	}
	if (server !== undefined)
		await new Promise<void>((resolve) => server.close(() => resolve()));
});

it("AC5: 导航到本地挑战页", async () => {
	await ready();
	const result = await run({ action: "navigate", url: `${origin}/` });

	expect(textOf(result)).toBe(`ok: navigate ${origin}/`);
	expect(detailsOf(result).ok).toBe(true);
});

it("AC5: click 点 #go，页面判定 PASS", async () => {
	await openChallenge();
	const click = await run({ action: "click", selector: "#go" });
	expect(textOf(click).split("\n")[0]).toBe("ok: click selector=#go");

	const verdict = await run({
		action: "eval",
		js: 'document.getElementById("__verdict").textContent',
	});
	expect(detailsOf(verdict).value).toBe("PASS");
});

it("AC5: type 发出成对的 keydown/keyup，Ctrl+A 全选", async () => {
	await openChallenge();
	await run({
		action: "eval",
		js: `(() => {
			const input = document.createElement("textarea");
			input.id = "__kbd";
			document.body.append(input);
			input.focus();
			globalThis.__kbd = { down: 0, up: 0, ctrlUp: 0, keys: [] };
			input.addEventListener("keydown", (event) => {
				globalThis.__kbd.down += 1;
				globalThis.__kbd.keys.push(event.key);
			});
			input.addEventListener("keyup", (event) => {
				globalThis.__kbd.up += 1;
				globalThis.__kbd.keys.push(event.key);
				if (event.key === "Control") globalThis.__kbd.ctrlUp += 1;
			});
			return "ok";
		})()`,
	});

	const typed = await run({ action: "type", text: "ab", replace: true });
	expect(textOf(typed).split("\n")[0]).toBe('ok: type "ab"');
	const afterType = await readKbd();
	expect(afterType.value).toBe("ab");
	expect(afterType.up).toBe(afterType.down);
	expect(afterType.down).toBeGreaterThanOrEqual(5);
	expect(
		afterType.keys.filter((key) => key === "a").length,
	).toBeGreaterThanOrEqual(2);

	const pressed = await run({ action: "press", key: "Ctrl+A" });
	expect(textOf(pressed)).toBe("ok: press Ctrl+A");
	const selected = await readKbd();
	expect([selected.start, selected.end]).toEqual([0, 2]);
	expect(selected.ctrlUp).toBeGreaterThanOrEqual(1);
});

it("AC5: 截屏落盘且文件存在", async () => {
	await openChallenge();
	const result = await executors.execute(
		"chrome_vision",
		{ full_page: false },
		SESSION,
	);
	const saved = detailsOf(result).path;
	expect(textOf(result)).toContain("Saved ");
	expect(typeof saved, textOf(result)).toBe("string");
	expect((await stat(saved as string)).size).toBeGreaterThan(0);
});

let opened: Promise<void> | undefined;

/**
 * 打开挑战页并把它切到前台。
 * 隐藏的标签页会被 Chrome 丢掉可信输入，所以点击前必须先让它可见。
 * 输入路径自己会把标签与窗口提到前台，这里显式走一次 chrome_tab switch，先验证这条路通。
 */
function openChallenge(): Promise<void> {
	opened ??= (async () => {
		await ready();
		const nav = await run({ action: "navigate", url: `${origin}/` });
		expect(textOf(nav)).toBe(`ok: navigate ${origin}/`);
		const listed = await executors.execute(
			"chrome_tab",
			{ action: "list" },
			SESSION,
		);
		const tabs = (detailsOf(listed).tabs ?? []) as { id: number }[];
		const switched = await executors.execute(
			"chrome_tab",
			{ action: "switch", tab: String(tabs[0]?.id) },
			SESSION,
		);
		expect(textOf(switched)).toBe(`ok: switch ${tabs[0]?.id}`);
		await waitVisible();
	})();
	return opened;
}

/** 只等一次：三条 AC5 共用同一个承诺，没连上时只等一个超时。 */
function ready(): Promise<void> {
	extensionReady ??= requireExtension(bridge);
	return extensionReady;
}

async function requireExtension(bridge: Bridge): Promise<void> {
	const deadline = Date.now() + CONNECT_TIMEOUT_MS;
	for (;;) {
		const status = await bridge.describe();
		// 认身份只认 extensionVersion，理由见 docs/ARCHITECTURE.md §3。
		if (status.connected && status.extensionVersion !== undefined) return;
		if (Date.now() >= deadline)
			throw new Error(
				`extension_missing: the browser extension is not connected\n${INSTALL_STEPS}`,
			);
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
}

/**
 * 等标签页真的可见。激活后 Chrome 要过一个 tick 才改 visibilityState，
 * 而窗口被别的窗口盖住时它一直是 hidden，那种情况只能请人把浏览器切到前台。
 */
async function waitVisible(): Promise<void> {
	const deadline = Date.now() + 5_000;
	let state: unknown;
	while (Date.now() < deadline) {
		const result = await run({
			action: "eval",
			js: "document.visibilityState",
		});
		state = detailsOf(result).value;
		if (state === "visible") return;
		await new Promise((resolve) => setTimeout(resolve, 200));
	}
	throw new Error(
		`the challenge tab reports visibilityState ${String(state)}; bring the browser window to the front and rerun`,
	);
}

function run(params: Record<string, unknown>): Promise<ToolResult> {
	return executors.execute("chrome_act", params, SESSION);
}

function textOf(result: ToolResult): string {
	return result.content
		.filter((part) => part.type === "text")
		.map((part) => part.text)
		.join("\n");
}

function detailsOf(result: ToolResult): Record<string, unknown> {
	return result.details;
}

interface KbdState {
	down: number;
	up: number;
	ctrlUp: number;
	keys: string[];
	value: string;
	start: number;
	end: number;
}

async function readKbd(): Promise<KbdState> {
	const result = await run({
		action: "eval",
		js: `(() => {
			const input = document.getElementById("__kbd");
			return JSON.stringify({
				...globalThis.__kbd,
				value: input.value,
				start: input.selectionStart,
				end: input.selectionEnd,
			});
		})()`,
	});
	return JSON.parse(String(detailsOf(result).value)) as KbdState;
}
