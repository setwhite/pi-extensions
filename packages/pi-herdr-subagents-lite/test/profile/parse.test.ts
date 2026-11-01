import { rmSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { catalog, profileFrom, profilesDir, useProfileDirs, writeProfile } from "../support/profile-fixture.ts";

useProfileDirs();

it("splits frontmatter from the body", () => {
  const profile = profileFrom("description: Explore the repo", "# Explore\n\nFind things.\n");

  expect(profile.name).toBe("explore");
  expect(profile.description).toBe("Explore the repo");
  expect(profile.body).toBe("# Explore\n\nFind things.");
});

it("requires a name", () => {
  writeProfile("plain.md", "Just text.\n");

  expect(catalog()).toEqual({
    profiles: [],
    problems: [
      {
        name: "plain",
        file: join(profilesDir(), "plain.md"),
        field: "name",
        reason: "required",
      },
    ],
  });
});

it("uses the frontmatter name as the key, not the file name", () => {
  const profile = profileFrom("name: reviewer\ndescription: Review code");

  expect(profile.name).toBe("reviewer");
});

it("trims the name and rejects a blank one", () => {
  expect(profileFrom("name: '  reviewer  '\ndescription: x").name).toBe("reviewer");
  rmSync(profilesDir(), { recursive: true, force: true });

  const file = writeProfile("blank.md", "---\nname: '   '\n---\n\nbody\n");

  expect(catalog()).toEqual({
    profiles: [],
    problems: [{ name: "blank", file, field: "name", reason: "expected a non-empty name" }],
  });
});

it("parses skills as a list", () => {
  expect(profileFrom("skills: a").skills).toEqual(["a"]);
  expect(profileFrom("skills: [a, b]").skills).toEqual(["a", "b"]);
  expect(profileFrom('skills: ""').skills).toEqual([]);
  expect(profileFrom("skills: []").skills).toEqual([]);
  expect(profileFrom("description: none").skills).toBeUndefined();
});

it("reads the remaining profile fields", () => {
  const profile = profileFrom(
    'model: opencode-go/x\nthinking: high\ntools: "read,bash"\nsystem-prompt: replace\nauto-exit: true\ndisable-model-invocation: true',
  );

  expect(profile.model).toBe("opencode-go/x");
  expect(profile.thinking).toBe("high");
  expect(profile.tools).toBe("read,bash");
  expect(profile.systemPrompt).toBe("replace");
  expect(profile.autoExit).toBe(true);
  expect(profile.disableModelInvocation).toBe(true);
});

it("fills defaults", () => {
  const profile = profileFrom("description: x");

  expect(profile.model).toBeUndefined();
  expect(profile.thinking).toBeUndefined();
  expect(profile.tools).toBeUndefined();
  expect(profile.skills).toBeUndefined();
  expect(profile.systemPrompt).toBe("append");
  expect(profile.autoExit).toBe(false);
  expect(profile.disableModelInvocation).toBe(false);
});

it("accepts signed tool lists", () => {
  expect(profileFrom("tools: +read,-bash").tools).toBe("+read,-bash");
  expect(profileFrom('tools: ""').tools).toBe("");
});

it("rejects malformed tool lists", () => {
  for (const value of ["read,+bash", "read,,bash", "+"]) {
    const file = writeProfile("explore.md", `---\nname: explore\ntools: ${value}\n---\n\nbody\n`);

    expect(catalog().problems).toEqual([
      {
        name: "explore",
        file,
        field: "tools",
        reason: "expected names, or +name/-name entries, not both",
      },
    ]);
  }
});

it("rejects skills that are not names", () => {
  for (const value of ['["a", ""]', '["+a"]']) {
    const file = writeProfile("explore.md", `---\nname: explore\nskills: ${value}\n---\n\nbody\n`);

    expect(catalog().problems).toEqual([
      { name: "explore", file, field: "skills", reason: "expected names without +/- prefixes" },
    ]);
  }
});
