import { errorText } from "../error/index.ts";
import { type Profile, type ProfileCatalog, resolveSkillPaths } from "../profile/index.ts";
import { ToolError } from "./errors.ts";

export function profileLabel(profile: Profile): string {
  return profile.description === "" ? profile.name : `${profile.name} — ${profile.description}`;
}

export async function resolveSkills(profile: Profile, cwd: string, trusted: boolean): Promise<string[] | undefined> {
  if (profile.skills === undefined) {
    return undefined;
  }
  try {
    return await resolveSkillPaths(profile.skills, cwd, trusted);
  } catch (error) {
    throw new ToolError("profile_invalid", errorText(error));
  }
}

export function resolveProfile({ profiles, problems }: ProfileCatalog, name: string): Profile {
  const invalid = problems.filter((problem) => problem.name === name);
  if (invalid.length > 0) {
    throw new ToolError(
      "profile_invalid",
      invalid.map((problem) => `${problem.file}: ${problem.field}: ${problem.reason}`).join("; "),
    );
  }
  const profile = profiles.find((candidate) => candidate.name === name);
  if (profile) {
    return profile;
  }
  const available = profiles.length === 0 ? "none" : profiles.map(profileLabel).join(", ");
  throw new ToolError("unknown_profile", `unknown profile "${name}"; available: ${available}`);
}
