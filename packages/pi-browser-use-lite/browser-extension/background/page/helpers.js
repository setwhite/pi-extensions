/**
 * 页面内辅助函数。注入时按源码字符串化，所以每个函数体必须自包含：
 * 不引用模块作用域，只用页面里已有的全局。
 */

/** 把辅助函数装成页面全局 `__piHelpers`，供求值表达式调用。 */
export function installPageHelpers() {
	globalThis.__piHelpers = {
		/** 把 `returnByValue` 会丢的值包成标记，扩展侧再解包。 */
		stringify(value) {
			if (value === undefined) return { kind: "undefined" };
			if (value instanceof Error)
				return { kind: "error", name: value.name, message: value.message };
			if (
				typeof DOMRectReadOnly !== "undefined" &&
				value instanceof DOMRectReadOnly
			)
				return {
					kind: "rect",
					x: value.x,
					y: value.y,
					width: value.width,
					height: value.height,
				};
			return value;
		},
	};
}
