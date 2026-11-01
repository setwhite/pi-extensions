import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { errorText } from "../error/index.ts";
import { EXAMPLE_PROFILE, EXAMPLE_PROFILE_FILE } from "./examples.ts";

export function seedExampleProfile(profilesDir: string): void {
  const file = join(profilesDir, "examples", EXAMPLE_PROFILE_FILE);
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, EXAMPLE_PROFILE, { flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      return;
    }
    // 示例是可选文件；写不成不能阻止扩展加载。
    process.emitWarning(`pi-herdr-subagents-lite: could not write ${file}: ${errorText(error)}`);
  }
}
