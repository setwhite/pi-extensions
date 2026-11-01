import { leadingChars } from "./truncate.ts";

const PROFILE_SLUG_CHARS = 16;
const PANE_LABEL_CHARS = 32;

export function profileSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, PROFILE_SLUG_CHARS);
  if (slug === "") {
    return "worker";
  }
  return /^[a-z]/.test(slug) ? slug : `agent-${slug}`;
}

export function paneLabel(task: string): string {
  const line = task.split(/\r?\n/, 1)[0] ?? "";
  const text = line
    .replace(/\p{Cc}/gu, " ")
    .replace(/^\s*(?:#{1,6}\s+|[-*+]\s+|\d+[.)]\s+|>\s*)+/, "")
    .replace(/\*\*|__|~~|`/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return leadingChars(text, PANE_LABEL_CHARS);
}

export function createNamer(): (profile: string) => string {
  const counters = new Map<string, number>();
  return (profile) => {
    const slug = profileSlug(profile);
    const number = counters.get(slug) ?? 1;
    counters.set(slug, number + 1);
    return `${slug}-${number}`;
  };
}
