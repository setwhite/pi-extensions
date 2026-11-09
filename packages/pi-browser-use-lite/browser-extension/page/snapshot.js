/**
 * 页面快照采集。经典脚本，注入 MAIN world 后挂 globalThis.__piChromeSnapshotPage。
 */
(() => {
	const REF_OF_ELEMENT = "__piSnapshotRefOfElement";
	const ELEMENT_OF_REF = "__piSnapshotElementOfRef";
	const REF_COUNT = "__piSnapshotRefCount";
	/** 跳过整棵子树的标签。 */
	const SKIP_TAGS = new Set([
		"script",
		"style",
		"template",
		"noscript",
		"svg",
		"head",
	]);
	const ROLE_BY_TAG = {
		a: "link",
		button: "button",
		select: "combobox",
		textarea: "textbox",
		summary: "button",
	};
	const ROLE_BY_INPUT = {
		button: "button",
		checkbox: "checkbox",
		file: "button",
		image: "button",
		radio: "radio",
		reset: "button",
		submit: "button",
	};
	const TEXT_LIMIT = 120;

	/** 压缩空白。 */
	function normalize(value) {
		return String(value ?? "")
			.replace(/\s+/g, " ")
			.trim();
	}

	/** 压缩空白，截到上限。 */
	function compact(value, limit) {
		const text = normalize(value);
		return text.length > limit ? text.slice(0, limit) : text;
	}

	function inputType(element) {
		return (element.getAttribute("type") || "text").toLowerCase();
	}

	function headingLevel(element) {
		const tag = element.tagName.toLowerCase();
		if (/^h[1-6]$/.test(tag)) return Number(tag.slice(1));
		return Number(element.getAttribute("aria-level") || 2);
	}

	function roleOf(element) {
		const explicit = element.getAttribute("role");
		if (explicit) return explicit.toLowerCase();
		const tag = element.tagName.toLowerCase();
		if (tag === "input") return ROLE_BY_INPUT[inputType(element)] ?? "textbox";
		if (tag === "a") return element.getAttribute("href") ? "link" : undefined;
		if (/^h[1-6]$/.test(tag)) return "heading";
		if (element.getAttribute("contenteditable") === "true") return "textbox";
		return ROLE_BY_TAG[tag];
	}

	function isHeading(element) {
		return roleOf(element) === "heading";
	}

	function isVisible(element) {
		if (element.hasAttribute("hidden")) return false;
		if (typeof element.checkVisibility === "function")
			return element.checkVisibility();
		const rect = element.getBoundingClientRect();
		return rect.width > 0 && rect.height > 0;
	}

	function isInteractive(element) {
		if (roleOf(element)) return true;
		const tabindex = element.getAttribute("tabindex");
		return tabindex !== null && tabindex !== "-1";
	}

	function isField(element) {
		const tag = element.tagName.toLowerCase();
		if (tag === "textarea" || tag === "select") return true;
		if (tag === "input") {
			return !["button", "image", "reset", "submit"].includes(
				inputType(element),
			);
		}
		return element.getAttribute("contenteditable") === "true";
	}

	function labelText(element) {
		let current = element.parentElement;
		for (let depth = 0; current && depth < 3; depth += 1) {
			if (current.tagName.toLowerCase() === "label")
				return compact(current.textContent, TEXT_LIMIT);
			current = current.parentElement;
		}
		return "";
	}

	function nameOf(element) {
		const labelledBy = element.getAttribute("aria-labelledby");
		const labelledText = labelledBy
			? labelledBy
					.split(/\s+/)
					.map((id) => document.getElementById(id)?.textContent ?? "")
					.join(" ")
					.trim()
			: "";
		const ariaLabel = element.getAttribute("aria-label") || labelledText;
		const direct =
			ariaLabel ||
			element.getAttribute("alt") ||
			labelText(element) ||
			element.getAttribute("placeholder") ||
			(typeof element.value === "string" ? element.value : "");
		return compact(direct || element.textContent, TEXT_LIMIT);
	}

	function rectOf(element) {
		const rect = element.getBoundingClientRect();
		return {
			x: Math.round(rect.x),
			y: Math.round(rect.y),
			width: Math.round(rect.width),
			height: Math.round(rect.height),
		};
	}

	/** 元素不完全在视口里时才滚到中间：把页面滚动当成副作用尽量少做。 */
	function bringIntoView(element) {
		const rect = element.getBoundingClientRect();
		const visible =
			rect.x >= 0 &&
			rect.y >= 0 &&
			rect.x + rect.width <= innerWidth &&
			rect.y + rect.height <= innerHeight;
		if (!visible) element.scrollIntoView({ block: "center", inline: "center" });
	}

	/** 掉出文档的元素不会再被点到，留着只让 ref map 变大。 */
	function forgetDetached() {
		const elementOf = globalThis[ELEMENT_OF_REF];
		if (!elementOf) return;
		for (const [ref, element] of elementOf) {
			if (element.isConnected === false) elementOf.delete(ref);
		}
	}

	function refFor(element) {
		if (!globalThis[REF_OF_ELEMENT]) globalThis[REF_OF_ELEMENT] = new WeakMap();
		const refOf = globalThis[REF_OF_ELEMENT];
		const known = refOf.get(element);
		if (known) return known;
		const next = (globalThis[REF_COUNT] ?? 0) + 1;
		globalThis[REF_COUNT] = next;
		const ref = `e${next}`;
		refOf.set(element, ref);
		if (!globalThis[ELEMENT_OF_REF]) globalThis[ELEMENT_OF_REF] = new Map();
		globalThis[ELEMENT_OF_REF].set(ref, element);
		return ref;
	}

	function fieldState(element) {
		const tag = element.tagName.toLowerCase();
		const type = tag === "input" ? inputType(element) : undefined;
		if (type === "checkbox" || type === "radio")
			return { checked: element.checked === true };
		const value =
			typeof element.value === "string"
				? element.value
				: (element.getAttribute("value") ?? "");
		return { value: compact(value, TEXT_LIMIT) };
	}

	function readElement(element) {
		return {
			ref: refFor(element),
			tag: element.tagName.toLowerCase(),
			role: roleOf(element),
			name: nameOf(element),
			text: compact(element.textContent, TEXT_LIMIT),
			rect: rectOf(element),
		};
	}

	/** 先序遍历可见子树。隐藏子树整棵跳过，与 Chrome 的可见性一致。 */
	function walk(element, visit) {
		for (const child of element.children ?? []) {
			if (child.nodeType !== 1) continue;
			if (SKIP_TAGS.has(child.tagName.toLowerCase())) continue;
			if (!isVisible(child)) continue;
			visit(child);
			walk(child, visit);
		}
	}

	/** 可见子树的文本，跳过脚本、样式与隐藏的子树。 */
	function textOf(element) {
		const parts = [];
		readText(element, parts);
		return parts.join(" ");
	}

	function readText(element, parts) {
		// children 只有元素。文本节点只在 childNodes 里。
		for (const child of element.childNodes ?? []) {
			if (child.nodeType === 3) {
				const text = normalize(child.textContent);
				if (text) parts.push(text);
				continue;
			}
			if (child.nodeType !== 1) continue;
			if (SKIP_TAGS.has(child.tagName.toLowerCase())) continue;
			if (!isVisible(child)) continue;
			readText(child, parts);
		}
	}

	function collect() {
		forgetDetached();
		const headings = [];
		const elements = [];
		const fields = [];
		walk(document.body, (element) => {
			if (isHeading(element))
				headings.push({
					level: headingLevel(element),
					text: compact(element.textContent, TEXT_LIMIT),
				});
			if (isInteractive(element)) elements.push(readElement(element));
			if (isField(element))
				fields.push({
					ref: refFor(element),
					tag: element.tagName.toLowerCase(),
					name: nameOf(element),
					...fieldState(element),
				});
		});
		return {
			title: document.title,
			url: location.href,
			headings,
			elements,
			fields,
			bodyText: textOf(document.body),
		};
	}

	/** 深查一个元素。ref 优先于 selector；`scroll` 让指针动作先把元素带进视口。 */
	function inspect({ ref, selector, scroll }) {
		const elementOf = globalThis[ELEMENT_OF_REF];
		const element = ref
			? elementOf?.get(ref)
			: document.querySelector(selector);
		if (!element || element.isConnected === false) {
			// 元素已经被换掉：旧坐标落在别的元素上，静默点下去就是错的动作。
			if (ref) elementOf?.delete(ref);
			throw new Error(
				ref
					? `ref ${ref} is stale; take a new snapshot`
					: `selector matched no element: ${selector}`,
			);
		}
		// rect 是视口坐标。折叠线外先滚到中间，指针动作才点得到；已经看得见就别动页面。
		if (scroll) bringIntoView(element);
		return {
			title: document.title,
			url: location.href,
			element: readElement(element),
		};
	}

	globalThis.__piChromeSnapshotPage = { collect, inspect };
})();
