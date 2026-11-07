import { afterEach, expect, it } from "vitest";
import { extensionUrl, stubChrome, uninstallChrome } from "./chrome-stub.ts";

interface UploadModule {
	upload: (params: Record<string, unknown>) => Promise<{ uploaded: string[] }>;
}

const { upload } = (await import(
	extensionUrl("input/upload.js")
)) as UploadModule;

afterEach(() => {
	uninstallChrome();
});

it("AC2: 点击触发 file chooser 后按路径调 DOM.setFileInputFiles", async () => {
	const stub = stubChrome({ evaluate: () => true });

	const uploading = upload({
		tabId: 101,
		paths: ["/tmp/a.txt", "/tmp/b.txt"],
		timeoutMs: 1000,
	});
	setTimeout(() => {
		stub.emit({ tabId: 101 }, "Page.fileChooserOpened", {
			backendNodeId: 7,
			mode: "selectMultiple",
		});
	}, 0);

	const result = await uploading;

	expect(result).toEqual({ uploaded: ["/tmp/a.txt", "/tmp/b.txt"] });
	expect(stub.calls.map((call) => call.method)).toEqual([
		"Page.enable",
		"Page.setInterceptFileChooserDialog",
		"Runtime.evaluate",
		"DOM.setFileInputFiles",
		"Page.setInterceptFileChooserDialog",
	]);
	expect(
		stub.calls.find((call) => call.method === "DOM.setFileInputFiles")?.params,
	).toEqual({ backendNodeId: 7, files: ["/tmp/a.txt", "/tmp/b.txt"] });
	expect(stub.calls.at(-1)?.params).toEqual({ enabled: false });
	expect(stub.debugger.onEvent.removeListener).toHaveBeenCalled();
});

it("AC3: 没等到 file chooser 时抛超时错误并关掉拦截", async () => {
	const stub = stubChrome({ evaluate: () => true });

	await expect(
		upload({ tabId: 102, paths: ["/tmp/a.txt"], timeoutMs: 20 }),
	).rejects.toThrow("timeout: no file chooser opened within 20ms");

	expect(stub.calls.at(-1)).toMatchObject({
		method: "Page.setInterceptFileChooserDialog",
		params: { enabled: false },
	});
	expect(stub.debugger.onEvent.removeListener).toHaveBeenCalled();
});

it("交付物: 页面没有文件输入时抛 page_error", async () => {
	const stub = stubChrome({ evaluate: () => false });

	await expect(
		upload({ tabId: 103, paths: ["/tmp/a.txt"], timeoutMs: 1000 }),
	).rejects.toThrow("page_error: page has no input[type=file]");

	expect(
		stub.calls.filter((call) => call.method === "DOM.setFileInputFiles"),
	).toHaveLength(0);
	expect(stub.calls.at(-1)?.params).toEqual({ enabled: false });
});

it("bad_args: 路径为空或缺 timeoutMs 时抛错且不发 CDP", async () => {
	const stub = stubChrome();

	await expect(upload({ tabId: 104, paths: [] })).rejects.toThrow(
		"bad_args: paths",
	);
	await expect(upload({ tabId: 104, paths: ["/tmp/a.txt"] })).rejects.toThrow(
		"bad_args: timeoutMs",
	);
	await expect(
		upload({ tabId: 104, paths: [""], timeoutMs: 1000 }),
	).rejects.toThrow("bad_args: every path");

	expect(stub.debugger.sendCommand).not.toHaveBeenCalled();
});

it("交付物: 别的标签的 file chooser 事件不算数", async () => {
	const stub = stubChrome({ evaluate: () => true });

	const uploading = upload({
		tabId: 105,
		paths: ["/tmp/a.txt"],
		timeoutMs: 20,
	});
	setTimeout(() => {
		stub.emit({ tabId: 999 }, "Page.fileChooserOpened", { backendNodeId: 7 });
	}, 0);

	await expect(uploading).rejects.toThrow("timeout: no file chooser opened");
});

it("定时器先到、激活点击后抛错时不留下未处理的 rejection", async () => {
	const stub = stubChrome({
		evaluate: () =>
			new Promise((_resolve, reject) => {
				setTimeout(
					() => reject(new Error("page_error: evaluation failed")),
					30,
				);
			}),
	});

	await expect(
		upload({ tabId: 106, paths: ["/tmp/a.txt"], timeoutMs: 10 }),
	).rejects.toThrow("page_error: evaluation failed");

	expect(stub.calls.at(-1)?.params).toEqual({ enabled: false });
	expect(stub.debugger.onEvent.removeListener).toHaveBeenCalled();
});
