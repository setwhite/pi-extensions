import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { errorText } from "../error/index.ts";
import { EXAMPLE_PROFILE, EXAMPLE_PROFILE_FILE } from "./examples.ts";

export function seedExampleProfile(profilesDir: string): void {
  const dir = join(profilesDir, "examples");
  try {
    mkdirSync(dir, { recursive: true });
    // 示例目录是分发物，不是用户数据：每次加载都与包内一致，旧示例过期比丢改动更糟（DEC-0057）。
    writeFileSync(join(dir, EXAMPLE_PROFILE_FILE), EXAMPLE_PROFILE);
    for (const entry of readdirSync(dir)) {
      if (entry !== EXAMPLE_PROFILE_FILE) {
        rmSync(join(dir, entry), { recursive: true, force: true });
      }
    }
  } catch (error) {
    // 示例是可选文件；写不成不能阻止扩展加载。
    process.emitWarning(`pi-herdr-subagents-lite: could not write ${dir}: ${errorText(error)}`);
  }
}
