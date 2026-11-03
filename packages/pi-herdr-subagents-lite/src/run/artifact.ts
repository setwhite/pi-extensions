import { rename, rm, writeFile } from "node:fs/promises";

function artifactPath(base: string, seq: number): string {
  return `${base}.result-${seq}.md`;
}

export async function writeArtifact(base: string, seq: number, text: string): Promise<string> {
  const path = artifactPath(base, seq);
  const temp = `${path}.tmp`;
  try {
    await writeFile(temp, text);
    await rename(temp, path);
  } catch (error) {
    // 清理失败不能覆盖原始错误。
    await rm(temp, { force: true }).catch(() => undefined);
    throw error;
  }
  return path;
}
