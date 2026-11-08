import { onCommitted } from "./capture.js";
import { dispatch } from "./dispatch.js";
import { startTransport } from "./transport.js";

const POLL_ALARM_NAME = "pi-browser-use:poll";
const POLL_ALARM_MINUTES = 0.5;

/** 武装轮询用的 alarm。重复调用是安全的：同名 alarm 会被替换。 */
function armPollAlarm() {
	chrome.alarms.create(POLL_ALARM_NAME, {
		periodInMinutes: POLL_ALARM_MINUTES,
	});
}

let polling = false;

/** 起轮询。重复调用是安全的：一次只跑一个循环。 */
function startPolling() {
	if (polling) return;
	polling = true;
	const transport = startTransport({
		version: chrome.runtime.getManifest().version,
		dispatch,
	});
	void transport.done.then(() => {
		polling = false;
	});
}

/** 醒来后把 alarm 续上，并确保轮询在跑。 */
function onWake() {
	armPollAlarm();
	startPolling();
}

/** 只认自己的 alarm：唤醒前的第一件事是续上它，然后让轮询起跑。 */
function onPollAlarm(alarm) {
	if (alarm.name !== POLL_ALARM_NAME) return;
	onWake();
}

chrome.webNavigation.onCommitted.addListener(onCommitted);
chrome.runtime.onInstalled.addListener(onWake);
chrome.runtime.onStartup.addListener(onWake);
chrome.alarms.onAlarm.addListener(onPollAlarm);
armPollAlarm();
