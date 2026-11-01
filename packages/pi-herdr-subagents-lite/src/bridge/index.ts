import type { BlockedKind, Config } from "../config/index.ts";

interface BridgePi {
  on(event: "ui_prompt_start" | "ui_prompt_end", handler: (event: { kind: BlockedKind; title?: string }) => void): void;
  events: { emit(channel: "herdr:blocked", data: { active: boolean; label?: string }): void };
}

export function createBridge(pi: BridgePi, config: Config["bridge"]): void {
  if (!config.enabled) {
    return;
  }
  pi.on("ui_prompt_start", (event) => {
    if (!config.blockedOn.includes(event.kind)) {
      return;
    }
    pi.events.emit("herdr:blocked", { active: true, label: event.title ?? event.kind });
  });
  pi.on("ui_prompt_end", (event) => {
    if (!config.blockedOn.includes(event.kind)) {
      return;
    }
    pi.events.emit("herdr:blocked", { active: false });
  });
}
