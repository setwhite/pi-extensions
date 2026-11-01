import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, it } from "vitest";
import { EXAMPLE_PROFILE, EXAMPLE_PROFILE_FILE } from "../src/profile/index.ts";

const agentDir = mkdtempSync(join(tmpdir(), "pi-herdr-index-"));
process.env.PI_CODING_AGENT_DIR = agentDir;
const { default: extension } = await import("../src/index.ts");

afterAll(() => {
  delete process.env.PI_CODING_AGENT_DIR;
  rmSync(agentDir, { recursive: true, force: true });
});

it("exports the extension factory", () => {
  expect(typeof extension).toBe("function");
});

it("seeds the example profile under the agent dir", () => {
  const file = join(agentDir, "pi-herdr-subagents-lite", "profiles", "examples", EXAMPLE_PROFILE_FILE);

  expect(readFileSync(file, "utf8")).toBe(EXAMPLE_PROFILE);
});
