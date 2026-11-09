import { sendCommand } from "../input/debugger.js";

/** 整页截图的上限；超过就报 timeout。 */
const FULL_PAGE_TIMEOUT_MS = 120_000;
/** 整页高度超过视口这么多倍时，改按屏分块。 */
const TILES_FACTOR = 4;
/** 能落盘的图片格式。 */
const FORMATS = new Set(["png", "jpeg"]);

/**
 * 截屏一次，返回图片数据与像素尺寸。整页超过 4 倍视口时按屏分块。
 * @param {object} params
 * @param {number} params.tabId 标签 id
 * @param {"png" | "jpeg"} [params.format] 图片格式，默认 `png`
 * @param {boolean} [params.fullPage] 截整页，默认 `false`
 * @returns {Promise<{ format: string, images: Array<{ data: string }> }>} 图片按顺序排列，单张时只有一个元素
 */
export async function screenshotPage({
	tabId,
	format = "png",
	fullPage = false,
} = {}) {
	if (!Number.isInteger(tabId))
		throw new Error("bad_args: tabId must be an integer");
	if (!FORMATS.has(format))
		throw new Error(`bad_args: unknown format: ${format}`);
	if (typeof fullPage !== "boolean")
		throw new Error("bad_args: fullPage must be a boolean");
	const metrics = await sendCommand(tabId, "Page.getLayoutMetrics", {});
	const viewport = boxOf(metrics?.cssLayoutViewport, metrics?.layoutViewport);
	// 视口截图不带 clip：CDP 的 clip 用页面坐标，(0,0) 是文档左上角，不是当前滚动位置。
	if (!fullPage)
		return { format, images: [await capture(tabId, format, undefined, false)] };
	const page = boxOf(metrics?.cssContentSize, metrics?.contentSize);
	const images = await withTimeout(
		captureWhole(tabId, format, page, viewport),
		FULL_PAGE_TIMEOUT_MS,
	);
	return { format, images };
}

/** 整页一张，或按页高均分成几段。均分是为了不出现只剩几像素的末段。 */
async function captureWhole(tabId, format, page, viewport) {
	if (page.height <= viewport.height * TILES_FACTOR)
		return [
			await capture(
				tabId,
				format,
				{ x: 0, y: 0, width: page.width, height: page.height },
				true,
			),
		];
	const tiles = Math.ceil(page.height / viewport.height);
	const slice = Math.ceil(page.height / tiles);
	const images = [];
	for (let index = 0; index < tiles; index += 1) {
		const y = index * slice;
		images.push(
			await capture(
				tabId,
				format,
				{
					x: 0,
					y,
					width: page.width,
					height: Math.min(slice, page.height - y),
				},
				true,
			),
		);
	}
	return images;
}

async function capture(tabId, format, clip, beyondViewport) {
	const params = {
		format,
		captureBeyondViewport: beyondViewport,
		fromSurface: true,
	};
	if (clip !== undefined) params.clip = { ...clip, scale: 1 };
	const response = await sendCommand(tabId, "Page.captureScreenshot", params);
	if (!response?.data)
		throw new Error("page_error: screenshot returned no data");
	return { data: response.data };
}

/** 取尺寸。Chrome 给 CSS 与旧版两套字段，任一套齐就能用。 */
function boxOf(css, legacy) {
	const box = css ?? legacy;
	const width = Number(box?.width ?? box?.clientWidth);
	const height = Number(box?.height ?? box?.clientHeight);
	if (!Number.isFinite(width) || !Number.isFinite(height) || !height)
		throw new Error("page_error: could not read page size");
	return { x: 0, y: 0, width, height };
}

/** 超时抛 `timeout:`；原调用之后自己失败也不会留下未处理的 rejection。 */
function withTimeout(promise, ms) {
	let timer;
	const deadline = new Promise((_resolve, reject) => {
		timer = setTimeout(
			() => reject(new Error(`timeout: full page screenshot exceeded ${ms}ms`)),
			ms,
		);
	});
	return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}
