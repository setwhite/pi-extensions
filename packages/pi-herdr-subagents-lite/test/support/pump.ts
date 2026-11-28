import type { FakeClient } from "./fake-client.ts";

/** 排空微任务：真实 fs 读盘不会在微任务里完成，用它把 watcher 停在 readChildResult 的 await 上。 */
export async function advanceMicrotasks(): Promise<void> {
  for (let index = 0; index < 50; index++) {
    await Promise.resolve();
  }
}

/** watcher 每被唤醒一次都会重开 wait；按 idle 反复收尾，每轮让出事件循环，直到条件成立。 */
export async function pumpIdle(fake: FakeClient, reached: () => boolean): Promise<void> {
  for (let round = 0; round < 40 && !reached(); round++) {
    if (fake.pendingWaits() > 0) {
      fake.resolveWait("idle");
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  }
}
