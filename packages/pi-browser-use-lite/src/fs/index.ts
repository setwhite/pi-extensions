/** 截图落盘与按数量修剪。只依赖 node:，不碰配置与网络。 */

import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/** 一张待落盘的图。`data` 是 base64。 */
export type ScreenshotImage = { data: string };

export type SaveOptions = {
	/** 目录，`~` 开头的按家目录展开 */
	dir: string;
	format: "png" | "jpeg";
	/** 按顺序落盘，多于一张时文件名带 `-NofM` */
	images: ScreenshotImage[];
	/** 修剪后保留的文件数 */
	keepNewest: number;
	/** 文件名里的时间戳，默认当前毫秒 */
	stamp?: number;
};

const SCREENSHOT = /\.(?:png|jpeg)$/i;

/**
 * 给这批图腾出保留位再写。多张图各占一个保留位。
 * @returns {Promise<string[]>} 落盘的绝对路径，与 `images` 同序，写完都还在
 */
export async function saveScreenshots({
	dir,
	format,
	images,
	keepNewest,
	stamp = Date.now(),
}: SaveOptions): Promise<string[]> {
	if (images.length === 0) throw new Error("bad_args: no images to save");
	if (!Number.isInteger(keepNewest) || keepNewest < 0)
		throw new Error("bad_args: keepNewest must be a non-negative integer");
	if (images.length > keepNewest)
		throw new Error(
			`bad_args: keepNewest ${keepNewest} cannot hold ${images.length} images`,
		);
	const target = expandHome(dir);
	await mkdir(target, { recursive: true });
	const suffix = format === "jpeg" ? ".jpeg" : ".png";
	const base = `screenshot-${stamp}`;
	const paths = images.map((_image, index) =>
		join(
			target,
			images.length === 1
				? `${base}${suffix}`
				: `${base}-${index + 1}of${images.length}${suffix}`,
		),
	);
	await pruneScreenshots({
		dir: target,
		keepNewest: keepNewest - images.length,
	});
	await Promise.all(
		images.map((image, index) =>
			writeFile(paths[index], Buffer.from(image.data, "base64")),
		),
	);
	return paths;
}

/**
 * 按修改时间保留最新 `keepNewest` 个截图，其余删掉。
 * @returns {Promise<string[]>} 删掉的路径
 */
export async function pruneScreenshots({
	dir,
	keepNewest,
}: {
	dir: string;
	keepNewest: number;
}): Promise<string[]> {
	if (!Number.isInteger(keepNewest) || keepNewest < 0)
		throw new Error("bad_args: keepNewest must be a non-negative integer");
	const entries = await readdir(dir, { withFileTypes: true });
	const shots = await Promise.all(
		entries
			.filter((entry) => entry.isFile() && SCREENSHOT.test(entry.name))
			.map(async (entry) => {
				const path = join(dir, entry.name);
				const info = await stat(path);
				return { path, mtime: info.mtimeMs };
			}),
	);
	// mtime 相同时按文件名倒序，让结果可复现。
	shots.sort(
		(left, right) =>
			right.mtime - left.mtime || right.path.localeCompare(left.path),
	);
	const removed = shots.slice(keepNewest);
	await Promise.all(removed.map((shot) => rm(shot.path)));
	return removed.map((shot) => shot.path);
}

/** 把开头的 `~` 换成家目录。 */
export function expandHome(dir: string): string {
	if (dir === "~") return homedir();
	if (dir.startsWith("~/") || dir.startsWith("~\\"))
		return join(homedir(), dir.slice(2));
	return dir;
}
