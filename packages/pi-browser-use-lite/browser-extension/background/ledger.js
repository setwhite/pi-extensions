/**
 * 台账：一个键同时写 storage.session 与 storage.local，读的时候先 session 再 local。
 * session 随扩展重载清空，local 留着，所以扩展重载后还能找回上一次的台账。
 */

export async function readRecord(key) {
	for (const area of [chrome.storage.session, chrome.storage.local]) {
		const stored = await area.get(key);
		if (stored[key] !== undefined) return stored[key];
	}
	return undefined;
}

export async function writeRecord(key, value) {
	await chrome.storage.session.set({ [key]: value });
	await chrome.storage.local.set({ [key]: value });
}

export async function removeRecord(key) {
	await chrome.storage.session.remove(key);
	await chrome.storage.local.remove(key);
}

/**
 * 带某个前缀的所有键的值。
 * @param {string} prefix 键前缀
 * @returns {Promise<unknown[]>} 各键的值，同一个键只算一次
 */
export async function valuesWithPrefix(prefix) {
	const values = new Map();
	for (const area of [chrome.storage.session, chrome.storage.local]) {
		const stored = await area.get(null);
		for (const [key, value] of Object.entries(stored ?? {}))
			if (key.startsWith(prefix)) values.set(key, value);
	}
	return [...values.values()];
}

/**
 * 按前缀作废整份台账。
 * @param {string[]} prefixes 键前缀
 */
export async function forgetPrefixes(prefixes) {
	const keys = new Set();
	for (const area of [chrome.storage.session, chrome.storage.local]) {
		const stored = await area.get(null);
		for (const key of Object.keys(stored ?? {}))
			if (prefixes.some((prefix) => key.startsWith(prefix))) keys.add(key);
	}
	if (keys.size === 0) return;
	for (const area of [chrome.storage.session, chrome.storage.local])
		await area.remove([...keys]);
}
