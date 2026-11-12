import type { ExtensionFactory } from "@earendil-works/pi-coding-agent";
import { loadConfig } from "./config/index.ts";
import { createExtension } from "./extension/index.ts";
import { createHerdrHost } from "./herdr/index.ts";
import { agentDir, globalProfilesDir, loadProfiles, seedExampleProfile } from "./profile/index.ts";
import { readSessionTail } from "./session-file/index.ts";

seedExampleProfile(globalProfilesDir());

const extension: ExtensionFactory = createExtension({
  createHost: (config) => createHerdrHost(config.herdrBin),
  readSessionTail,
  loadConfig: () => loadConfig(agentDir()),
  loadProfiles,
});

export default extension;
