import { expect, it } from "vitest";
import { execCommand } from "../../src/herdr/cli.ts";

// 用 node 自己当被调用程序：argv 可控，行为确定，不依赖 herdr。
const hang = ["-e", "setTimeout(() => {}, 5000)"];

it("maps a hung command to herdr_timeout", async () => {
  await expect(execCommand(process.execPath, hang, { timeoutMs: 50 })).rejects.toMatchObject({
    code: "herdr_timeout",
  });
});

it("maps an aborted command to aborted", async () => {
  const controller = new AbortController();
  const pending = execCommand(process.execPath, hang, { signal: controller.signal, timeoutMs: 10_000 });

  controller.abort();

  await expect(pending).rejects.toMatchObject({ code: "aborted" });
});

it("maps a non-zero exit to herdr_failed", async () => {
  await expect(execCommand(process.execPath, ["-e", "process.exit(3)"], { timeoutMs: 10_000 })).rejects.toMatchObject({
    code: "herdr_failed",
  });
});

it("keeps a herdr error body", async () => {
  const script =
    'console.error(JSON.stringify({ error: { code: "agent_name_taken", message: "taken" } })); process.exit(1);';

  await expect(execCommand(process.execPath, ["-e", script], { timeoutMs: 10_000 })).rejects.toMatchObject({
    code: "name_taken",
  });
});
