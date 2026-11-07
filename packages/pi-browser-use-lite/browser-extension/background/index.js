const POLL_ALARM_NAME = "pi-browser-use:poll";
const POLL_ALARM_MINUTES = 0.5;

/** 武装轮询用的 alarm。重复调用是安全的：同名 alarm 会被替换。 */
function armPollAlarm() {
	chrome.alarms.create(POLL_ALARM_NAME, {
		periodInMinutes: POLL_ALARM_MINUTES,
	});
}

/** 醒来后把 alarm 续上。 */
function onPollAlarm(alarm) {
	if (alarm.name !== POLL_ALARM_NAME) return;
	armPollAlarm();
}

chrome.runtime.onInstalled.addListener(armPollAlarm);
// alarm 不保证跨浏览器重启存活，所以启动时再武装一次。
chrome.runtime.onStartup.addListener(armPollAlarm);
chrome.alarms.onAlarm.addListener(onPollAlarm);
