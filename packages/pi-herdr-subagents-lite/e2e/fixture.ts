// 每个 e2e 文件自建一套隔离环境；文件被跳过时连 beforeAll 都不跑。
import { afterAll, beforeAll } from "vitest";
import { HerdrE2e } from "./harness.ts";

export function useHerdrE2e(prepare: (e2e: HerdrE2e) => void): () => HerdrE2e {
  let e2e: HerdrE2e | undefined;
  beforeAll(async () => {
    const created = await HerdrE2e.create();
    e2e = created;
    prepare(created);
  }, 240_000);
  afterAll(async () => {
    await e2e?.teardown();
  });
  return () => {
    if (e2e === undefined) {
      throw new Error("e2e harness is not ready");
    }
    return e2e;
  };
}

export function writeExploreProfile(e2e: HerdrE2e): void {
  e2e.writeProfile("explore", "description: Explore the repo", "Read files and answer questions about the repository.");
}
