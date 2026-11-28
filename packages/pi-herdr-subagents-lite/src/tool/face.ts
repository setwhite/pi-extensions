import type { RunView, Spawned, SteerResult } from "../run/index.ts";

/** 白名单投影：服务层新增字段默认不进模型面，要露必须先改这里。 */
function pick<T extends object, K extends keyof T>(value: T, keys: readonly K[]): Pick<T, K> {
  const picked = {} as Pick<T, K>;
  for (const key of keys) {
    if (value[key] !== undefined) {
      picked[key] = value[key];
    }
  }
  return picked;
}

export function spawnFace(spawned: Spawned) {
  return pick(spawned, ["id", "status", "worktree"] as const);
}

export function viewFace(view: RunView) {
  return pick(view, ["id", "status", "cwd", "worktree"] as const);
}

export function steerFace(result: SteerResult) {
  return pick(result, ["id", "status"] as const);
}
