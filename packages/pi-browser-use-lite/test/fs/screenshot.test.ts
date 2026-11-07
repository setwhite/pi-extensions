import { existsSync, mkdtempSync, readdirSync } from "node:fs";
import { mkdir, readFile, utimes, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import {
	expandHome,
	pruneScreenshots,
	saveScreenshots,
} from "../../src/fs/index.ts";

const DATA = Buffer.from("image-bytes").toString("base64");

function tempDir(): string {
	return mkdtempSync(join(tmpdir(), "pi-screenshots-"));
}

function names(dir: string): string[] {
	return readdirSync(dir).sort();
}

it("AC6/AC7: 落盘的文件真实存在，jpeg 用 .jpeg 结尾", async () => {
	const dir = join(tempDir(), "nested", "shots");

	const paths = await saveScreenshots({
		dir,
		format: "jpeg",
		images: [{ data: DATA }],
		keepNewest: 20,
		stamp: 1_700_000_000_000,
	});

	expect(paths).toHaveLength(1);
	expect(paths[0].endsWith(".jpeg")).toBe(true);
	expect(existsSync(paths[0])).toBe(true);
	expect(await readFile(paths[0], "utf8")).toBe("image-bytes");
});

it("AC3/AC4: 分块的文件名带序号，目录里没有 .json", async () => {
	const dir = tempDir();

	const paths = await saveScreenshots({
		dir,
		format: "png",
		images: [{ data: DATA }, { data: DATA }, { data: DATA }],
		keepNewest: 20,
		stamp: 1_700_000_000_001,
	});

	expect(names(dir)).toEqual([
		"screenshot-1700000000001-1of3.png",
		"screenshot-1700000000001-2of3.png",
		"screenshot-1700000000001-3of3.png",
	]);
	expect(paths).toHaveLength(3);
	expect(names(dir).some((name) => name.endsWith(".json"))).toBe(false);
});

it("AC6: 保留位装不下这一批时报错，也不落盘", async () => {
	const dir = tempDir();

	await expect(
		saveScreenshots({
			dir,
			format: "png",
			images: [{ data: DATA }, { data: DATA }, { data: DATA }],
			keepNewest: 2,
		}),
	).rejects.toThrow("bad_args: keepNewest 2 cannot hold 3 images");
	expect(readdirSync(dir)).toEqual([]);
});

it("AC6: 先腾位再写，返回的路径都还在", async () => {
	const dir = tempDir();
	const images = [{ data: DATA }, { data: DATA }];

	await saveScreenshots({
		dir,
		format: "png",
		images,
		keepNewest: 2,
		stamp: 1,
	});
	const paths = await saveScreenshots({
		dir,
		format: "png",
		images,
		keepNewest: 2,
		stamp: 2,
	});

	expect(paths.every((path) => existsSync(path))).toBe(true);
	expect(names(dir)).toEqual([
		"screenshot-2-1of2.png",
		"screenshot-2-2of2.png",
	]);
});

it("AC5: 修剪只留最新 keepNewest 个文件", async () => {
	const dir = tempDir();
	for (let index = 0; index < 5; index += 1) {
		const path = join(dir, `screenshot-${index}.png`);
		await writeFile(path, "x");
		await utimes(path, index + 1, index + 1);
	}
	await writeFile(join(dir, "notes.json"), "{}");

	await pruneScreenshots({ dir, keepNewest: 3 });

	expect(names(dir)).toEqual([
		"notes.json",
		"screenshot-2.png",
		"screenshot-3.png",
		"screenshot-4.png",
	]);
});

it("AC8: 分块的每个文件各占一个保留位", async () => {
	const dir = tempDir();
	const images = [{ data: DATA }];

	await saveScreenshots({
		dir,
		format: "png",
		images: [images[0], images[0], images[0]],
		keepNewest: 3,
		stamp: 1_700_000_000_002,
	});
	const kept = await saveScreenshots({
		dir,
		format: "png",
		images: [images[0], images[0]],
		keepNewest: 3,
		stamp: 1_700_000_000_003,
	});

	const remaining = names(dir);

	expect(remaining).toHaveLength(3);
	expect(
		remaining.filter((name) => name.startsWith("screenshot-1700000000003-")),
	).toEqual([
		"screenshot-1700000000003-1of2.png",
		"screenshot-1700000000003-2of2.png",
	]);
	expect(
		remaining.filter((name) => name.startsWith("screenshot-1700000000002-")),
	).toHaveLength(1);
	expect(kept.every((path) => existsSync(path))).toBe(true);
	expect(kept).toHaveLength(2);
});

it("AC9: ~ 展开为家目录，目录不存在时自动创建", async () => {
	const dir = join(tempDir(), "made", "on", "demand");

	expect(expandHome("~/.pi/screenshots")).toBe(
		join(homedir(), ".pi", "screenshots"),
	);
	expect(expandHome("~")).toBe(homedir());
	expect(expandHome("/tmp/plain")).toBe("/tmp/plain");

	await mkdir(join(dir, ".."), { recursive: true });
	await saveScreenshots({
		dir,
		format: "png",
		images: [{ data: DATA }],
		keepNewest: 20,
		stamp: 1_700_000_000_004,
	});

	expect(existsSync(dir)).toBe(true);
});
