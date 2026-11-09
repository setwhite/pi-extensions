/**
 * GitHub 专用 handler：URL 解析 + 调用 gh CLI + 渲染。
 * 不 clone、不落盘、不发 HTTP；gh 不可用或执行失败时返回 skipped（原因交给工具层注明）。
 */

import type { HandlerSkip, HandlerSuccess, PageHandler } from "../types.ts";
import { checkGhAvailable, execGh, GH_MAX_BUFFER, shortDetail } from "./gh.ts";
import { renderTarget } from "./render.ts";

export type GitHubTarget =
	| { kind: "repo"; owner: string; repo: string }
	| { kind: "blob"; owner: string; repo: string; ref: string; path: string }
	| { kind: "tree"; owner: string; repo: string; ref: string; path: string }
	| { kind: "issue"; owner: string; repo: string; number: number }
	| { kind: "pull"; owner: string; repo: string; number: number; files: boolean }
	| { kind: "release"; owner: string; repo: string; tag: string }
	| { kind: "commit"; owner: string; repo: string; sha: string }
	| { kind: "compare"; owner: string; repo: string; spec: string }
	| { kind: "run"; owner: string; repo: string; id: number };

const GITHUB_HOSTS = new Set(["github.com", "www.github.com"]);
/** 2 段路径才会被当成仓库，这些首段其实是站内路由。 */
const RESERVED_FIRST_SEGMENTS = new Set([
	"about",
	"apps",
	"codespaces",
	"collections",
	"dashboard",
	"enterprise",
	"explore",
	"features",
	"issues",
	"join",
	"login",
	"marketplace",
	"new",
	"notifications",
	"orgs",
	"pricing",
	"pulls",
	"search",
	"settings",
	"site",
	"sponsors",
	"topics",
	"trending",
]);

const REPO_FIELDS = [
	"name",
	"description",
	"url",
	"stargazerCount",
	"forkCount",
	"defaultBranchRef",
	"primaryLanguage",
	"licenseInfo",
	"updatedAt",
];
const ISSUE_FIELDS = [
	"title",
	"number",
	"state",
	"stateReason",
	"author",
	"createdAt",
	"closedAt",
	"labels",
	"assignees",
	"milestone",
	"comments",
	"body",
	"url",
];
const ISSUE_CORE_FIELDS = [
	"title",
	"number",
	"state",
	"author",
	"createdAt",
	"closedAt",
	"labels",
	"assignees",
	"milestone",
	"comments",
	"body",
	"url",
];
const PR_FIELDS = [
	"title",
	"number",
	"state",
	"isDraft",
	"author",
	"baseRefName",
	"headRefName",
	"createdAt",
	"mergedAt",
	"closedAt",
	"labels",
	"additions",
	"deletions",
	"changedFiles",
	"comments",
	"body",
	"url",
];
const PR_CORE_FIELDS = [
	"title",
	"number",
	"state",
	"isDraft",
	"author",
	"baseRefName",
	"headRefName",
	"createdAt",
	"mergedAt",
	"closedAt",
	"labels",
	"additions",
	"deletions",
	"changedFiles",
	"comments",
	"body",
	"url",
];
const RELEASE_FIELDS = [
	"tagName",
	"name",
	"isDraft",
	"isPrerelease",
	"publishedAt",
	"author",
	"body",
	"url",
];

/**
 * 单命令单投影的页面把投影写在 `--jq` 里，不回 TS 里再拼一遍：这类页面没有跨源合并与解码可做。
 * 字段取不到时 jq 直接失败，于是走 skipped 顺延 —— 比静默少一行好查。
 */
const COMMIT_JQ = [
	'"- Author: " + (.commit.author.name // "unknown") + " <" + (.commit.author.email // "") + ">"',
	'"- Date: " + .commit.author.date',
	'"- Stats: +" + (.stats.additions | tostring) + " -" + (.stats.deletions | tostring) + " in " + ((.files // []) | length | tostring) + " files"',
	'""',
	'"## Message"',
	'""',
	".commit.message",
	'""',
	'"## Files"',
	'""',
	'((.files // [])[] | "- " + .status + " " + .filename + " (+" + (.additions | tostring) + " -" + (.deletions | tostring) + ")")',
].join(", ");

/** compare 的 REST 接口对提交数有硬上限；拿到的比 total_commits 少时要说出来。 */
const COMPARE_JQ = [
	'"- Ahead / behind: " + (.ahead_by | tostring) + " / " + (.behind_by | tostring) + " · " + .status',
	'"- Commits: " + (.total_commits | tostring)',
	'(if .total_commits > ((.commits // []) | length) then "- Note: the API returned the first " + ((.commits // []) | length | tostring) + " commits only" else empty end)',
	'""',
	'"## Commits"',
	'""',
	'((.commits // [])[] | "- " + .sha[0:7] + " " + (.commit.message | split("\\n")[0]))',
	'""',
	'"## Files"',
	'""',
	'((.files // [])[] | "- " + .status + " " + .filename + " (+" + (.additions | tostring) + " -" + (.deletions | tostring) + ")")',
].join(", ");

export const githubHandler: PageHandler = {
	name: "github",
	// 域名命中就进来：形状不认时要给一条具体原因，不能让「没走 gh」静默
	match: (url) => GITHUB_HOSTS.has(url.hostname.toLowerCase()),
	async run(url, ctx) {
		const settings = ctx.github;
		if (!settings.enabled) {
			return skip("handlers.github.enabled is false; GitHub-specific handling skipped");
		}
		const target = parseGitHubUrl(url);
		// 形状不认就在探测前放弃：一次探测要起两个子进程
		if (!target) {
			return skip("this GitHub page type has no gh route; the extractor chain takes over");
		}

		const exec = ctx.execGh ?? execGh;
		const availability = await checkGhAvailable(settings.command, {
			exec,
			timeoutMs: settings.timeoutMs,
			proxy: ctx.proxy,
			signal: ctx.signal,
		});
		if (!availability.ok) return skip(availability.reason);
		// 探测走通的那条路（带代理或不带）就是业务命令的路，两者不能各走各的
		const env = availability.env;

		const outputs: string[] = [];
		for (const [index, step] of planSteps(target).entries()) {
			const runOptions = {
				timeoutMs: settings.timeoutMs,
				maxBuffer: GH_MAX_BUFFER,
				env,
				signal: ctx.signal,
			};
			let result = await exec(settings.command, step.args, runOptions);
			if (!result.ok && step.coreArgs && isUnknownFieldError(result)) {
				result = await exec(settings.command, step.coreArgs, runOptions);
			}
			if (!result.ok) {
				// 首条命令失败 = 整个 handler 放弃；附加内容（如 README）失败则忽略
				if (index === 0) return skip(`gh ${step.args[0]} failed: ${shortDetail(result)}`);
				break;
			}
			outputs.push(result.stdout);
		}

		// gh 的 stdout 是文本通道：二进制过一遍 utf8 只剩乱码，交给链反而可能拿到东西
		if (target.kind === "blob" && looksBinary(outputs[0] ?? "")) {
			return skip("binary file; gh returns text only, so the extractor chain takes over");
		}

		const page = renderTarget(target, outputs, settings.maxChars);
		const handled: HandlerSuccess = {
			kind: "handled",
			handler: "github",
			url: url.toString(),
			...page,
		};
		return handled;
	},
};

/** 解析 6 类 GitHub 页面；query 与锚点忽略，其余形态返回 null 交给提取器链。 */
export function parseGitHubUrl(url: URL): GitHubTarget | null {
	if (!GITHUB_HOSTS.has(url.hostname.toLowerCase())) return null;

	const segments: string[] = [];
	for (const part of url.pathname.split("/")) {
		if (part === "") continue;
		try {
			segments.push(decodeURIComponent(part));
		} catch {
			return null;
		}
	}
	if (segments.length < 2) return null;

	const owner = segments[0];
	const repo = segments[1].replace(/\.git$/, "");
	if (!isOwner(owner) || !isRepo(repo)) return null;
	if (segments.length === 2) {
		return RESERVED_FIRST_SEGMENTS.has(owner.toLowerCase()) ? null : { kind: "repo", owner, repo };
	}

	const slug = { owner, repo };
	switch (segments[2].toLowerCase()) {
		case "blob": {
			if (segments.length < 5) return null;
			const ref = safeRef(segments[3]);
			return ref === null
				? null
				: { kind: "blob", ...slug, ref, path: segments.slice(4).join("/") };
		}
		case "tree": {
			if (segments.length < 4) return null;
			const ref = safeRef(segments[3]);
			return ref === null
				? null
				: { kind: "tree", ...slug, ref, path: segments.slice(4).join("/") };
		}
		case "issues": {
			if (segments.length !== 4) return null;
			const number = positiveInt(segments[3]);
			return number === null ? null : { kind: "issue", ...slug, number };
		}
		case "pull": {
			if (segments.length < 4 || segments.length > 5) return null;
			const number = positiveInt(segments[3]);
			if (number === null) return null;
			if (segments.length === 5 && segments[4].toLowerCase() !== "files") return null;
			return { kind: "pull", ...slug, number, files: segments.length === 5 };
		}
		case "releases": {
			if (segments.length < 5 || segments[3].toLowerCase() !== "tag") return null;
			// tag 与 blob/tree 的 ref 同过 safeRef：控制字符（如 %00）进了 gh 参数会被 execFile 拒，报错文案来自 Node 而非本层
			const tag = safeRef(segments.slice(4).join("/"));
			return tag === null ? null : { kind: "release", ...slug, tag };
		}
		case "commit": {
			if (segments.length !== 4) return null;
			const sha = segments[3];
			return /^[0-9a-fA-F]{7,40}$/.test(sha) ? { kind: "commit", ...slug, sha } : null;
		}
		case "compare": {
			if (segments.length < 4) return null;
			// ref 里可以有斜杠，切分点拿不到，所以整段拼回来；`...` 两侧都必须非空
			const spec = segments.slice(3).join("/");
			const sides = spec.split("...");
			if (sides.length !== 2 || sides[0] === "" || sides[1] === "" || /\s/.test(spec)) return null;
			return safeRef(spec) === null ? null : { kind: "compare", ...slug, spec };
		}
		case "actions": {
			if (segments.length !== 5 || segments[3].toLowerCase() !== "runs") return null;
			const id = positiveInt(segments[4]);
			return id === null ? null : { kind: "run", ...slug, id };
		}
		default:
			return null;
	}
}

interface GhStep {
	args: string[];
	/** gh 版本过旧不认某些 --json 字段时的回退命令。 */
	coreArgs?: string[];
}

function planSteps(target: GitHubTarget): GhStep[] {
	const repoSlug = `${target.owner}/${target.repo}`;
	switch (target.kind) {
		case "repo":
			return [
				{ args: ["repo", "view", repoSlug, "--json", REPO_FIELDS.join(",")] },
				{ args: ["api", `repos/${repoSlug}/readme`, "--jq", ".content"] },
			];
		case "blob": {
			const path = target.path.split("/").map(encodeURIComponent).join("/");
			return [
				{
					args: [
						"api",
						"-H",
						"Accept: application/vnd.github.raw",
						`repos/${repoSlug}/contents/${path}?ref=${encodeURIComponent(target.ref)}`,
					],
				},
			];
		}
		case "tree":
			return [
				{
					args: [
						"api",
						`repos/${repoSlug}/git/trees/${encodeURIComponent(target.ref)}?recursive=1`,
						"--jq",
						".tree[].path",
					],
				},
			];
		case "issue":
			return [
				{
					args: [
						"issue",
						"view",
						String(target.number),
						"--repo",
						repoSlug,
						"--json",
						ISSUE_FIELDS.join(","),
					],
					coreArgs: [
						"issue",
						"view",
						String(target.number),
						"--repo",
						repoSlug,
						"--json",
						ISSUE_CORE_FIELDS.join(","),
					],
				},
			];
		case "pull":
			return target.files
				? [{ args: ["pr", "diff", String(target.number), "--repo", repoSlug] }]
				: [
						{
							args: [
								"pr",
								"view",
								String(target.number),
								"--repo",
								repoSlug,
								"--json",
								PR_FIELDS.join(","),
							],
							coreArgs: [
								"pr",
								"view",
								String(target.number),
								"--repo",
								repoSlug,
								"--json",
								PR_CORE_FIELDS.join(","),
							],
						},
					];
		case "commit":
			return [{ args: ["api", `repos/${repoSlug}/commits/${target.sha}`, "--jq", COMMIT_JQ] }];
		case "compare":
			return [{ args: ["api", `repos/${repoSlug}/compare/${target.spec}`, "--jq", COMPARE_JQ] }];
		case "run":
			return [
				{ args: ["run", "view", String(target.id), "--repo", repoSlug] },
				// 只有失败步骤的日志值得看；成功的 run 上这条会失败，恰好被「附加步骤失败就忽略」吃掉
				{ args: ["run", "view", String(target.id), "--repo", repoSlug, "--log-failed"] },
			];
		case "release":
			// tag 取自 URL 末段，可能以 - 开头；gh 走 pflag，-- 之后一律当位置参数，所以 flag 全排在它前面
			return [
				{
					args: [
						"release",
						"view",
						"--repo",
						repoSlug,
						"--json",
						RELEASE_FIELDS.join(","),
						"--",
						target.tag,
					],
				},
			];
	}
}

function isUnknownFieldError(result: { stderr: string; error?: string }): boolean {
	return /unknown (?:json )?field|UnknownField/i.test(`${result.stderr}\n${result.error ?? ""}`);
}

/** 二进制过 utf8 解码会留下 NUL 或替换字符；正文里出现它们就说明这个文件不能当文本读。 */
function looksBinary(text: string): boolean {
	return text.includes("\u0000") || text.includes("\uFFFD");
}

function skip(reason: string): HandlerSkip {
	return { kind: "skipped", handler: "github", reason };
}

function isOwner(value: string): boolean {
	return /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(value) && !value.includes("--");
}

function isRepo(value: string): boolean {
	return /^[A-Za-z0-9_][A-Za-z0-9._-]{0,99}$/.test(value);
}

function safeRef(segment: string | undefined): string | null {
	// biome-ignore lint/suspicious/noControlCharactersInRegex: 这里就是要拦控制字符（含 NUL），不是误写
	if (!segment || segment.length > 1024 || /[\0-\x1f\x7f]/.test(segment)) return null;
	return segment;
}

function positiveInt(segment: string | undefined): number | null {
	if (!segment || !/^\d+$/.test(segment)) return null;
	const value = Number.parseInt(segment, 10);
	return Number.isSafeInteger(value) && value > 0 ? value : null;
}
