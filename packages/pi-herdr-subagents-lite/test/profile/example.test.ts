import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { EXAMPLE_PROFILE, seedExampleProfile } from "../../src/profile/index.ts";
import { agentRoot, catalog, profilesDir, useProfileDirs } from "../support/profile-fixture.ts";

useProfileDirs();

it("writes the example profile only when it is missing", () => {
  seedExampleProfile(profilesDir());
  const file = join(profilesDir(), "examples", "domain.md");

  expect(readFileSync(file, "utf8")).toBe(EXAMPLE_PROFILE);

  writeFileSync(file, "edited\n");
  seedExampleProfile(profilesDir());

  expect(readFileSync(file, "utf8")).toBe("edited\n");
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
  copyFileSync(join(profilesDir(), "examples", "domain.md"), join(profilesDir(), "domain.md"));

  expect(catalog()).toEqual({
    profiles: [expect.objectContaining({ name: "domain", autoExit: false, disableModelInvocation: false })],
    problems: [],
  });
});

it("keeps the example file name and name in sync", () => {
  expect(EXAMPLE_PROFILE).toContain("name: domain\n");
  expect(EXAMPLE_PROFILE).toContain("profiles/domain.md");
});
