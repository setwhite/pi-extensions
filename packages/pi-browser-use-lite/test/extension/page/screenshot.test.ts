import { afterEach, expect, it, vi } from "vitest";
import {
	extensionUrl,
	stubChrome,
	uninstallChrome,
} from "../input/chrome-stub.ts";

interface ScreenshotModule {
	screenshotPage: (params: {
		tabId: number;
		format?: string;
		fullPage?: boolean;
	}) => Promise<{ format: string; images: Array<{ data: string }> }>;
}

const IMAGE = Buffer.from("image-bytes").toString("base64");
const VIEWPORT = { clientWidth: 800, clientHeight: 600 };

async function loadScreenshot(): Promise<ScreenshotModule> {
	return (await import(extensionUrl("page/screenshot.js"))) as ScreenshotModule;
}

function metrics(pageHeight: number) {
	return {
		cssLayoutViewport: { ...VIEWPORT, pageX: 0, pageY: 0 },
		cssContentSize: { x: 0, y: 0, width: 800, height: pageHeight },
	};
}

/** 按方法应答：布局尺寸给真值，截屏给假图。 */
function answer(pageHeight: number) {
	return (method: string) => {
		if (method === "Page.getLayoutMetrics") return metrics(pageHeight);
		return { data: IMAGE };
	};
}

afterEach(() => {
	uninstallChrome();
	vi.useRealTimers();
});

it("AC2: 不传 fullPage 时截当前视口，不带 clip", async () => {
	const stub = stubChrome({ send: answer(2_000) });

	const result = await loadScreenshot().then((module) =>
		module.screenshotPage({ tabId: 401 }),
	);
	const captures = stub.calls.filter(
		(call) => call.method === "Page.captureScreenshot",
	);

	expect(result.images).toHaveLength(1);
	expect(captures).toHaveLength(1);
	expect(captures[0].params).toMatchObject({
		captureBeyondViewport: false,
		fromSurface: true,
	});
	// clip 用页面坐标，(0,0) 是文档左上角。带上它，滚动后的「视口」会跑到文档顶部。
	expect(captures[0].params.clip).toBeUndefined();
});

it("AC2: 页面已滚动时视口截图仍不带 clip", async () => {
	const stub = stubChrome({
		send: (method) =>
			method === "Page.getLayoutMetrics"
				? {
						cssLayoutViewport: { ...VIEWPORT, pageX: 0, pageY: 3_000 },
						cssContentSize: { x: 0, y: 0, width: 800, height: 9_000 },
					}
				: { data: IMAGE },
	});

	await loadScreenshot().then((module) =>
		module.screenshotPage({ tabId: 406 }),
	);
	const [capture] = stub.calls.filter(
		(call) => call.method === "Page.captureScreenshot",
	);

	expect(capture.params.clip).toBeUndefined();
});

it("AC3: fullPage 且整页不超过 4 倍视口时产出一张整页图", async () => {
	const stub = stubChrome({ send: answer(2_000) });

	const result = await loadScreenshot().then((module) =>
		module.screenshotPage({ tabId: 402, fullPage: true }),
	);
	const [capture] = stub.calls.filter(
		(call) => call.method === "Page.captureScreenshot",
	);

	expect(result.images).toHaveLength(1);
	expect(capture.params.clip).toMatchObject({ width: 800, height: 2_000 });
	expect(capture.params.captureBeyondViewport).toBe(true);
});

it("AC3: fullPage 超 4 倍视口时按屏分块", async () => {
	const stub = stubChrome({ send: answer(3_000) });

	const result = await loadScreenshot().then((module) =>
		module.screenshotPage({ tabId: 403, fullPage: true }),
	);
	const captures = stub.calls.filter(
		(call) => call.method === "Page.captureScreenshot",
	);

	expect(result.images).toHaveLength(5);
	expect(captures.map((call) => call.params.clip)).toMatchObject([
		{ y: 0, height: 600 },
		{ y: 600, height: 600 },
		{ y: 1_200, height: 600 },
		{ y: 1_800, height: 600 },
		{ y: 2_400, height: 600 },
	]);
});

it("AC3: 刚过 4 倍视口时各段均分，末段不留几像素", async () => {
	const stub = stubChrome({ send: answer(2_401) });

	const result = await loadScreenshot().then((module) =>
		module.screenshotPage({ tabId: 405, fullPage: true }),
	);
	const captures = stub.calls.filter(
		(call) => call.method === "Page.captureScreenshot",
	);

	expect(result.images).toHaveLength(5);
	expect(
		captures.map((call) => (call.params.clip as { height: number }).height),
	).toEqual([481, 481, 481, 481, 477]);
});

it("AC10: 整页截图超过 120 秒抛 timeout", async () => {
	vi.useFakeTimers();
	stubChrome({
		send: (method) =>
			method === "Page.getLayoutMetrics"
				? metrics(2_000)
				: new Promise(() => {}),
	});
	const module = await loadScreenshot();

	const pending = module.screenshotPage({ tabId: 404, fullPage: true });
	const rejected = expect(pending).rejects.toThrow(/^timeout: .*120000ms/);

	await vi.runAllTimersAsync();
	await rejected;
});
