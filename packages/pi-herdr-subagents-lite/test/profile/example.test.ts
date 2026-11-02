import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { EXAMPLE_PROFILE, seedExampleProfile } from "../../src/profile/index.ts";
import { agentRoot, catalog, profilesDir, useProfileDirs } from "../support/profile-fixture.ts";

useProfileDirs();

function exampleFile(): string {
  return join(profilesDir(), "examples", "worker.md");
}

it("writes the example profile into an empty directory", () => {
  seedExampleProfile(profilesDir());

  expect(readFileSync(exampleFile(), "utf8")).toBe(EXAMPLE_PROFILE);
});

it("rewrites the example profile when it was edited", () => {
  seedExampleProfile(profilesDir());
  writeFileSync(exampleFile(), "edited\n");

  seedExampleProfile(profilesDir());

  expect(readFileSync(exampleFile(), "utf8")).toBe(EXAMPLE_PROFILE);
});

it("removes examples the extension does not ship", () => {
  seedExampleProfile(profilesDir());
  const examples = join(profilesDir(), "examples");
  writeFileSync(join(examples, "custom.md"), "mine\n");
  mkdirSync(join(examples, "nested"));
  writeFileSync(join(examples, "nested", "note.md"), "nested\n");

  seedExampleProfile(profilesDir());

  expect(readdirSync(examples)).toEqual(["worker.md"]);
  expect(readFileSync(join(examples, "worker.md"), "utf8")).toBe(EXAMPLE_PROFILE);
});

it("leaves user profiles in the profiles directory alone", () => {
  seedExampleProfile(profilesDir());
  const profile = join(profilesDir(), "worker.md");
  writeFileSync(profile, "user profile\n");

  seedExampleProfile(profilesDir());

  expect(readFileSync(profile, "utf8")).toBe("user profile\n");
});

it("does not fail when the example cannot be written", () => {
  const blocker = join(agentRoot(), "blocker");
  writeFileSync(blocker, "not a directory");
  const warning = vi.spyOn(process, "emitWarning").mockImplementation(() => undefined);

  expect(() => seedExampleProfile(blocker)).not.toThrow();
  expect(warning).toHaveBeenCalledOnce();

  warning.mockRestore();
});

it("keeps examples out of the loaded profiles", () => {
  seedExampleProfile(profilesDir());

  expect(catalog()).toEqual({ profiles: [], problems: [] });
});

it("loads the example once it is copied a level up", () => {
  seedExampleProfile(profilesDir());
  copyFileSync(exampleFile(), join(profilesDir(), "worker.md"));

  expect(catalog()).toEqual({
    profiles: [expect.objectContaining({ name: "worker", autoExit: true, disableModelInvocation: false })],
    problems: [],
  });
});

it("keeps the example file name and name in sync", () => {
  expect(EXAMPLE_PROFILE).toContain("name: worker\n");
  expect(EXAMPLE_PROFILE).toContain("profiles/worker.md");
});
