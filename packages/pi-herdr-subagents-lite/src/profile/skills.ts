import { DefaultPackageManager, getAgentDir, loadSkills, SettingsManager } from "@earendil-works/pi-coding-agent";

export function agentDir(): string {
  return getAgentDir();
}

export async function resolveSkillPaths(names: string[], cwd: string, trusted: boolean): Promise<string[]> {
  if (names.length === 0) {
    return [];
  }
  const dir = agentDir();
  const settingsManager = SettingsManager.create(cwd, dir, { projectTrusted: trusted });
  const packageManager = new DefaultPackageManager({ cwd, agentDir: dir, settingsManager });
  const resolved = await packageManager.resolve(() => Promise.resolve("skip"));
  const skillPaths = resolved.skills.filter((resource) => resource.enabled).map((resource) => resource.path);
  const { skills } = loadSkills({ cwd, agentDir: dir, skillPaths, includeDefaults: false });
  const byName = new Map(skills.map((skill) => [skill.name, skill.filePath]));
  return names.map((name) => {
    const file = byName.get(name);
    if (file === undefined) {
      throw new Error(`skill "${name}" is not available in ${cwd}`);
    }
    return file;
  });
}
