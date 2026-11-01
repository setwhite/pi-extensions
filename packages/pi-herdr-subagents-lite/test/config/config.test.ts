import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect, it } from "vitest";
import { loadConfig } from "../../src/config/index.ts";

const specDefaults = {
  enabled: true,
  toolName: "subagent",
  herdrBin: "herdr",
  maxConcurrent: 16,
  maxResultChars: 16384,
  aggregateWindowMs: 500,
  closeChildrenOn: [],
  inboxPollMs: 250,
  pollIntervalMs: 1000,
  idlePollIntervalMs: 8000,
  prompts: {},
  bridge: { enabled: true, blockedOn: ["custom", "select", "confirm", "input", "editor"] },
};

function withAgentDir<T>(file: string | undefined, read: (agentDir: string) => T): T {
  const agentDir = mkdtempSync(join(tmpdir(), "pi-herdr-config-"));
  if (file !== undefined) {
    const target = join(agentDir, "pi-herdr-subagents-lite", "config.json");
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, file);
  }
  try {
    return read(agentDir);
  } finally {
    rmSync(agentDir, { recursive: true, force: true });
  }
}

function readConfig(value?: unknown) {
  return withAgentDir(value === undefined ? undefined : JSON.stringify(value), (agentDir) => loadConfig(agentDir));
}

it("uses the spec defaults when the config file is missing", () => {
  expect(readConfig()).toEqual(specDefaults);
});

it("keeps the defaults for keys the file omits", () => {
  expect(readConfig({ maxConcurrent: 2 })).toEqual({ ...specDefaults, maxConcurrent: 2 });
});

it("takes an absolute herdr path", () => {
  expect(readConfig({ herdrBin: "/opt/herdr/bin/herdr" })).toMatchObject({ herdrBin: "/opt/herdr/bin/herdr" });
});

it.each([
  [{ maxConcurrent: 0 }, { maxConcurrent: 1 }],
  [{ maxConcurrent: 1000 }, { maxConcurrent: 1000 }],
  [{ maxResultChars: 1 }, { maxResultChars: 1024 }],
  [{ maxResultChars: 9999999 }, { maxResultChars: 1048576 }],
  [{ aggregateWindowMs: 99999 }, { aggregateWindowMs: 10000 }],
  [{ aggregateWindowMs: -1 }, { aggregateWindowMs: 0 }],
  [{ inboxPollMs: 1 }, { inboxPollMs: 50 }],
  [{ inboxPollMs: 99999 }, { inboxPollMs: 5000 }],
  [{ pollIntervalMs: 1 }, { pollIntervalMs: 100 }],
  [{ pollIntervalMs: 99999 }, { pollIntervalMs: 60000 }],
  [{ idlePollIntervalMs: 1 }, { idlePollIntervalMs: 100 }],
  [{ idlePollIntervalMs: 99999 }, { idlePollIntervalMs: 60000 }],
])("clamps %o", (patch, expected) => {
  expect(readConfig(patch)).toMatchObject(expected);
});

it.each([
  [{ nope: 1 }, /nope/],
  [{ enabled: "yes" }, /enabled/],
  [{ maxConcurrent: "3" }, /maxConcurrent/],
  [{ maxConcurrent: 2.5 }, /maxConcurrent/],
  [{ maxResultChars: "16384" }, /maxResultChars/],
  [{ closeChildrenOn: ["sometimes"] }, /closeChildrenOn.*sometimes/],
  [{ toolName: "Helper" }, /toolName/],
  [{ toolName: "1x" }, /toolName/],
  [{ herdrBin: "" }, /herdrBin/],
  [{ herdrBin: "   " }, /herdrBin/],
  [{ questionLines: 40 }, /questionLines/],
  [{ prompts: { nope: "x" } }, /prompts\.nope/],
  [{ prompts: { guidelines: "Use subagent" } }, /prompts\.guidelines/],
  [{ bridge: { extra: true } }, /bridge\.extra/],
  [{ bridge: { blockedOn: ["nope"] } }, /blockedOn.*nope/],
])("rejects invalid config %o", (value, message) => {
  expect(() => readConfig(value)).toThrow(message);
});

it("rejects a config file that is not valid JSON", () => {
  expect(() => withAgentDir("{", (agentDir) => loadConfig(agentDir))).toThrow(/not valid JSON/);
});

it("rejects a config file that is not a JSON object", () => {
  expect(() => withAgentDir("[]", (agentDir) => loadConfig(agentDir))).toThrow(/expected a JSON object/);
});

it("reads from the given agent dir, not the env", () => {
  const fromEnv = mkdtempSync(join(tmpdir(), "pi-herdr-config-"));
  const passed = mkdtempSync(join(tmpdir(), "pi-herdr-config-"));
  const file = join(fromEnv, "pi-herdr-subagents-lite", "config.json");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ maxConcurrent: 3 }));
  process.env.PI_CODING_AGENT_DIR = fromEnv;
  try {
    expect(loadConfig(passed).maxConcurrent).toBe(16);
  } finally {
    delete process.env.PI_CODING_AGENT_DIR;
    rmSync(fromEnv, { recursive: true, force: true });
    rmSync(passed, { recursive: true, force: true });
  }
});
