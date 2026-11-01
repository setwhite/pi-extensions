import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { getAgentDir, parseFrontmatter } from "@earendil-works/pi-coding-agent";
import { dataDir, isRaw } from "../config/index.ts";
import { errorText } from "../error/index.ts";
import {
  booleanField,
  enumField,
  type Fields,
  nameField,
  type Profile,
  type ProfileProblem,
  SYSTEM_PROMPT_MODES,
  skillsField,
  stringField,
  THINKING_LEVELS,
  toolsField,
} from "./frontmatter.ts";

export interface ProfileCatalog {
  profiles: Profile[];
  problems: ProfileProblem[];
}

export interface ProfileSources {
  cwd: string;
  trusted: boolean;
}

function parseProfile(file: string, source: string): { profile?: Profile; problems: ProfileProblem[] } {
  let frontmatter: unknown;
  let body: string;
  try {
    ({ frontmatter, body } = parseFrontmatter(source));
  } catch (error) {
    return { problems: [{ name: basename(file, ".md"), file, field: "frontmatter", reason: errorText(error) }] };
  }
  if (!isRaw(frontmatter)) {
    return { problems: [{ name: basename(file, ".md"), file, field: "frontmatter", reason: "expected a mapping" }] };
  }

  const problems: ProfileProblem[] = [];
  const fields: Fields = { raw: frontmatter, name: basename(file, ".md"), file, problems };
  const name = nameField(fields);
  if (name === undefined) {
    return { problems };
  }
  fields.name = name;
  const profile: Profile = {
    name,
    description: stringField(fields, "description") ?? "",
    body,
    model: stringField(fields, "model"),
    thinking: enumField(fields, "thinking", THINKING_LEVELS),
    tools: toolsField(fields),
    skills: skillsField(fields),
    systemPrompt: enumField(fields, "system-prompt", SYSTEM_PROMPT_MODES) ?? "append",
    autoExit: booleanField(fields, "auto-exit") ?? false,
    disableModelInvocation: booleanField(fields, "disable-model-invocation") ?? false,
  };
  return problems.length === 0 ? { profile, problems } : { problems };
}

function readProfilesDir(dir: string): ProfileCatalog {
  let entries: string[];
  try {
    entries = readdirSync(dir).filter((entry) => entry.endsWith(".md"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { profiles: [], problems: [] };
    }
    throw error;
  }

  const parsed: Array<{ profile: Profile; file: string }> = [];
  const problems: ProfileProblem[] = [];
  for (const entry of entries.sort()) {
    const file = join(dir, entry);
    let source: string;
    try {
      source = readFileSync(file, "utf8");
    } catch (error) {
      problems.push({ name: basename(entry, ".md"), file, field: "file", reason: errorText(error) });
      continue;
    }
    const result = parseProfile(file, source);
    if (result.profile) {
      parsed.push({ profile: result.profile, file });
    }
    problems.push(...result.problems);
  }

  const byName = new Map<string, Array<{ profile: Profile; file: string }>>();
  for (const entry of parsed) {
    const group = byName.get(entry.profile.name);
    if (group) {
      group.push(entry);
    } else {
      byName.set(entry.profile.name, [entry]);
    }
  }

  const profiles: Profile[] = [];
  for (const [name, group] of byName) {
    const [only] = group;
    if (only && group.length === 1) {
      profiles.push(only.profile);
      continue;
    }
    for (const entry of group) {
      const others = group.filter((other) => other.file !== entry.file).map((other) => other.file);
      problems.push({
        name,
        file: entry.file,
        field: "name",
        reason: `duplicate profile name; also in ${others.join(", ")}`,
      });
    }
  }
  profiles.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
  return { profiles, problems };
}

export function globalProfilesDir(): string {
  return join(dataDir(getAgentDir()), "profiles");
}

export function loadProfiles({ cwd, trusted }: ProfileSources): ProfileCatalog {
  const global = readProfilesDir(globalProfilesDir());
  if (!trusted) {
    return global;
  }

  const project = readProfilesDir(join(dataDir(join(cwd, ".pi")), "profiles"));
  const projectNames = new Set([
    ...project.profiles.map((profile) => profile.name),
    ...project.problems.map((problem) => problem.name),
  ]);
  const profiles = [...global.profiles.filter((profile) => !projectNames.has(profile.name)), ...project.profiles];
  const problems = [...global.problems.filter((problem) => !projectNames.has(problem.name)), ...project.problems];
  profiles.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
  return { profiles, problems };
}
