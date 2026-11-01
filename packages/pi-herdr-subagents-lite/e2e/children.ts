// 子代理的 tab 与进程：按标签识别，逐个关掉，等到 herdr 里都消失。
import type { HerdrSession } from "./herdr-session.ts";
import { killProcess, waitFor } from "./process.ts";

const CHILD_LABEL = /^(explore|selfexit)-\d+$/;

export async function closeChildren(session: HerdrSession): Promise<void> {
  for (const tab of await session.tabs()) {
    if (!CHILD_LABEL.test(tab.label)) {
      continue;
    }
    for (const pane of await session.panes()) {
      if (pane.tab_id !== tab.tab_id) {
        continue;
      }
      try {
        killProcess(await session.childPid(pane.pane_id));
      } catch {
        // pane 里已经没有 pi。
      }
    }
    try {
      await session.call(["tab", "close", tab.tab_id]);
    } catch {
      // tab 可能已自行关闭。
    }
  }
  await waitFor(
    async () => (await session.tabs()).every((tab) => !CHILD_LABEL.test(tab.label)),
    "child tabs to close",
    30_000,
  );
  await waitFor(
    async () => (await session.agents()).every((agent) => !CHILD_LABEL.test(agent.name ?? "")),
    "child agents to disappear",
    30_000,
  );
}
