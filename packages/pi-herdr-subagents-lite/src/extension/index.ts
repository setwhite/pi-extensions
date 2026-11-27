import type { Config } from "../config/index.ts";
import type { HerdrClient } from "../herdr/index.ts";
import { registerChild } from "./child.ts";
import { registerMain } from "./main.ts";
import type { ExtensionRegistrar } from "./types.ts";

export type { AgentMessage, ExtensionRegistrar, SendOptions, SessionContext } from "./types.ts";

export interface ExtensionDeps {
  loadConfig(): Config;
  createClient(): HerdrClient;
  runsDir(): string;
  /** 进程级身份：0 是主代理，>=1 是子代理。 */
  depth: number;
  runDir: string | undefined;
}

export function createExtension(deps: ExtensionDeps): (pi: ExtensionRegistrar) => void {
  return (pi) => {
    if (deps.depth >= 1) {
      registerChild(pi, deps);
      return;
    }
    registerMain(pi, deps);
  };
}
