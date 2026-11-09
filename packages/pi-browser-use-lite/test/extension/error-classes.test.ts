import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { isErrorClass } from "../../src/protocol/index.ts";

const ROOT = fileURLToPath(
	new URL("../../browser-extension/", import.meta.url),
);

/**
 * 扩展内部用 `new Error("<class>: ...")` 标类别，transport 再把它折成结果信封的 `{ class, message }`。
 * 类别写错不会报错，桥会静默归到 page_error，那一类的 hint 也就丢了。
 */
it("扩展抛出的错误前缀都是错误表里的类别", () => {
	const found: string[] = [];
	const offenders: string[] = [];
	for (const file of readdirSync(ROOT, {
		recursive: true,
		encoding: "utf-8",
	})) {
		if (!file.endsWith(".js")) continue;
		const source = readFileSync(`${ROOT}${file}`, "utf-8");
		for (const match of source.matchAll(/new Error\(\s*[`'"]([a-z_]+): /g)) {
			found.push(match[1]);
			if (!isErrorClass(match[1])) offenders.push(`${file}: ${match[1]}`);
		}
	}
	// 一个都没扫到说明约定变了，这条测试就白测了。
	expect(found.length).toBeGreaterThan(20);
	expect(offenders).toStrictEqual([]);
});
