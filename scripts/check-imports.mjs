/**
 * 依赖方向闸的统一驱动。每个包在 scripts/import-graph.mjs 里只写表与开关。
 * 规则改了先改该包的 docs/ARCHITECTURE.md，再改表；两边不一致 CI 会红。
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

const config = await import(
	pathToFileURL(join(process.cwd(), "scripts", "import-graph.mjs")).href
);

const SOURCE = config.root ?? "src";
const SKIP_DIRS = new Set(["node_modules", "test", "scripts", "docs", "assets"]);

function walk(directory, files = []) {
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;
		const path = join(directory, entry.name);
		if (entry.isDirectory()) {
			if (config.flat) {
				failures.push(`${posix(path)}/: ${SOURCE}/ 下不建目录（见 docs/ARCHITECTURE.md）`);
				continue;
			}
			walk(path, files);
		} else if (entry.name.endsWith(".ts")) {
			files.push(posix(relative(".", path)));
		}
	}
	return files;
}

const posix = (path) => path.replaceAll("\\", "/");

function moduleOf(path) {
	if (config.moduleStyle === "file") return path.slice(path.lastIndexOf("/") + 1).replace(/\.ts$/, "");
	const segments = path.split("/");
	if (segments.length > 2) return segments[1];
	// 顶层只有入口。其它顶层文件按自己的名字算模块，不继承入口的边，由 requireListed 报出。
	return segments[1] === "index.ts" ? "." : segments[1].replace(/\.ts$/, "");
}

/** 把相对导入按文件所在目录解析成包内 POSIX 路径，只用来判断归属模块。 */
function resolveSpec(file, spec) {
	const segments = [];
	const base = file.includes("/") ? file.slice(0, file.lastIndexOf("/")) : "";
	for (const segment of `${base}/${spec}`.split("/")) {
		if (segment === "" || segment === ".") continue;
		if (segment === "..") segments.pop();
		else segments.push(segment);
	}
	return segments.join("/");
}

/** 静态 import、`export ... from`、动态 import() 都算依赖；type-only 判定同 TS 语义。 */
function specifiers(source) {
	const found = [];
	for (const [, typeOnly, spec] of source.matchAll(
		/^import\s+(type\s+)?(?:[\w*{}\s,$]+from\s+)?["']([^"']+)["']/gm,
	)) {
		found.push({ typeOnly: typeOnly !== undefined, spec });
	}
	if (config.exportFrom) {
		for (const [, typeOnly, spec] of source.matchAll(
			/^export\s+(type\s+)?(?:\*|\{[^}]*\})\s+from\s+["']([^"']+)["']/gm,
		)) {
			found.push({ typeOnly: typeOnly !== undefined, spec });
		}
	}
	if (config.dynamicImport) {
		for (const [, spec] of source.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) {
			found.push({ typeOnly: false, spec });
		}
	}
	return found;
}

const failures = [];
const files = walk(SOURCE).sort();

for (const file of files) {
	const from = moduleOf(file);
	if (config.requireListed && !(from in config.edges)) {
		failures.push(`${file}: 未登记的模块——新增文件要同时改 edges 与 docs/ARCHITECTURE.md`);
		continue;
	}
	for (const { typeOnly, spec } of specifiers(readFileSync(file, "utf-8"))) {
		for (const rule of config.singleImport) {
			if (!rule.specifier.test(spec)) continue;
			const allowed =
				rule.only === undefined ||
				rule.only.some((entry) => file === entry || file.startsWith(entry));
			if (!allowed) {
				failures.push(`${file}: ${spec} is only allowed in ${rule.only.join(", ")}`);
			} else if (!typeOnly && rule.typeOnlyIn?.some((entry) => file.startsWith(entry))) {
				failures.push(`${file}: ${spec} must be import type`);
			}
		}
		if (!spec.startsWith(".")) continue;
		const to = moduleOf(resolveSpec(file, spec));
		if (to === from || config.edges[from]?.includes(to)) continue;
		failures.push(`${file}: depends on ${to}/ (not allowed from ${from}/)`);
	}
}

if (failures.length > 0) {
	console.error(config.title ?? "Import graph violates docs/ARCHITECTURE.md:");
	for (const failure of failures) console.error(`  ${failure}`);
	process.exit(1);
}
console.log(`ok: ${files.length} files`);
