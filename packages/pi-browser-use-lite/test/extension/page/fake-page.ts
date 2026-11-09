import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

export const PAGE_SOURCE = readFileSync(
	new URL("../../../browser-extension/page/snapshot.js", import.meta.url),
	"utf8",
);

export type Rect = { x: number; y: number; width: number; height: number };

export type FakeOptions = {
	/** 元素几何，默认 100x20，落在视口内 */
	rect?: Rect;
	/** `checkVisibility()` 的返回值 */
	visible?: boolean;
	value?: string;
	checked?: boolean;
	attrs?: Record<string, string>;
};

export type FakeElement = {
	[nodeType: string]: unknown;
	nodeType: 1;
	tagName: string;
	/** 与 DOM 一致：只有元素。文本节点在 `childNodes` 里。 */
	children: FakeElement[];
	childNodes: FakeNode[];
	parentElement: FakeElement | null;
	textContent: string;
	isConnected: boolean;
	scrollCalls: number;
	getAttribute(name: string): string | null;
	hasAttribute(name: string): boolean;
	getBoundingClientRect(): Rect;
	checkVisibility(): boolean;
	scrollIntoView(options?: { block?: string; inline?: string }): void;
};

export type FakeNode = FakeElement | { nodeType: 3; textContent: string };

function text(content: string) {
	return { nodeType: 3 as const, textContent: content };
}

/** 造一个元素。字符串子节点变成文本节点。 */
export function el(
	tag: string,
	options: FakeOptions = {},
	children: Array<FakeElement | string> = [],
): FakeElement {
	const node = {
		nodeType: 1 as const,
		tagName: tag.toUpperCase(),
		childNodes: [] as FakeNode[],
		isConnected: true,
		scrollCalls: 0,
		parentElement: null as FakeElement | null,
		attributes: new Map(Object.entries(options.attrs ?? {})),
		rect: options.rect ?? { x: 0, y: 0, width: 100, height: 20 },
		visible: options.visible ?? true,
		value: options.value,
		checked: options.checked,
	} as unknown as FakeElement;

	(node as Record<string, unknown>).getAttribute = (name: string) =>
		(node as unknown as { attributes: Map<string, string> }).attributes.get(
			name,
		) ?? null;
	(node as Record<string, unknown>).hasAttribute = (name: string) =>
		(node as unknown as { attributes: Map<string, string> }).attributes.has(
			name,
		);
	(node as Record<string, unknown>).getBoundingClientRect = () =>
		(node as unknown as { rect: Rect }).rect;
	(node as Record<string, unknown>).checkVisibility = () =>
		(node as unknown as { visible: boolean }).visible;
	Object.defineProperty(node, "textContent", {
		get: () => node.childNodes.map((child) => child.textContent).join(""),
	});
	Object.defineProperty(node, "children", {
		get: () => node.childNodes.filter((child) => child.nodeType === 1),
	});
	(node as Record<string, unknown>).scrollIntoView = () => {
		node.scrollCalls += 1;
	};
	for (const child of children) {
		const fake = typeof child === "string" ? text(child) : child;
		if (fake.nodeType === 1) fake.parentElement = node;
		node.childNodes.push(fake);
	}
	return node;
}

/** 把子元素挂到父元素上，维护反向链接。 */
export function append(parent: FakeElement, child: FakeElement) {
	child.parentElement = parent;
	parent.childNodes.push(child);
}

function findById(node: FakeElement, id: string): FakeElement | null {
	if (node.getAttribute("id") === id) return node;
	for (const child of node.children) {
		if (child.nodeType !== 1) continue;
		const found = findById(child, id);
		if (found) return found;
	}
	return null;
}

export type SnapshotElement = {
	ref: string;
	tag: string;
	role?: string;
	name?: string;
	text?: string;
	rect: Rect;
};

export type SnapshotField = {
	ref: string;
	tag: string;
	name?: string;
	value?: string;
	checked?: boolean;
};

export type SnapshotPayload = {
	title: string;
	url: string;
	headings: Array<{ level: number; text: string }>;
	elements: SnapshotElement[];
	fields: SnapshotField[];
	bodyText: string;
};

/** 在 vm 沙箱里跑页面脚本，返回它的采集结果。 */
export function loadSnapshotPage(options: {
	title?: string;
	url?: string;
	body: FakeElement;
}) {
	const document = {
		title: options.title ?? "Test page",
		body: options.body,
		getElementById: (id: string) => findById(options.body, id),
	};
	const context: Record<string, unknown> = {
		document,
		location: { href: options.url ?? "https://example.test/" },
		innerHeight: 800,
		innerWidth: 1_200,
	};
	runInNewContext(PAGE_SOURCE, context);
	const page = context.__piChromeSnapshotPage as {
		collect: () => SnapshotPayload;
		inspect: (target: {
			ref?: string;
			selector?: string;
			scroll?: boolean;
		}) => { url: string; title: string; element: SnapshotElement };
	};
	return {
		body: options.body,
		collect: () => page.collect(),
		page,
	};
}
