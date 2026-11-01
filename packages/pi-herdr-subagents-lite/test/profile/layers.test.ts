import { expect, it } from "vitest";
import { catalog, useProfileDirs, writeProfile, writeProjectProfile } from "../support/profile-fixture.ts";

useProfileDirs();

it("ignores unknown fields", () => {
  writeProfile("explore.md", "---\nname: explore\nsession-mode: yolo\ndenyWrites: true\n---\n\nbody\n");

  const { profiles, problems } = catalog();

  expect(problems).toEqual([]);
  expect(profiles.map((profile) => profile.name)).toEqual(["explore"]);
});

it("reports a bad thinking level", () => {
  const file = writeProfile("explore.md", "---\nname: explore\nthinking: sometimes\n---\n\nbody\n");

  const { profiles, problems } = catalog();

  expect(profiles).toEqual([]);
  expect(problems).toEqual([
    { name: "explore", file, field: "thinking", reason: "expected one of off, minimal, low, medium, high, xhigh, max" },
  ]);
});

it("reports a bad field type", () => {
  const file = writeProfile("explore.md", "---\nname: explore\nmodel: [a]\nauto-exit: yes please\n---\n\nbody\n");

  const { profiles, problems } = catalog();

  expect(profiles).toEqual([]);
  expect(problems).toEqual([
    { name: "explore", file, field: "model", reason: "expected string, got array" },
    { name: "explore", file, field: "auto-exit", reason: "expected boolean, got string" },
  ]);
});

it("reports broken frontmatter", () => {
  const file = writeProfile("broken.md", "---\nthinking: [\n---\n\nbody\n");

  const { problems } = catalog();

  expect(problems.map((problem) => problem.field)).toEqual(["frontmatter"]);
  expect(problems[0]?.file).toBe(file);
  expect(problems[0]?.name).toBe("broken");
});

it("returns no profiles when the agents directory is missing", () => {
  expect(catalog()).toEqual({ profiles: [], problems: [] });
});

it("reads project profiles when trusted", () => {
  writeProfile("global.md", "---\nname: global\n---\n\nGlobal body.\n");
  writeProjectProfile("project.md", "---\nname: project\n---\n\nProject body.\n");

  expect(catalog().profiles.map((profile) => profile.name)).toEqual(["global"]);
  expect(catalog({ trusted: true }).profiles.map((profile) => profile.name)).toEqual(["global", "project"]);
});

it("lets project profiles override global ones by name", () => {
  writeProfile("worker.md", "---\nname: worker\ndescription: Global worker\n---\n\nGlobal body.\n");
  writeProjectProfile("local.md", "---\nname: worker\ndescription: Project worker\n---\n\nProject body.\n");

  const { profiles } = catalog({ trusted: true });

  expect(profiles).toHaveLength(1);
  expect(profiles[0]?.name).toBe("worker");
  expect(profiles[0]?.description).toBe("Project worker");
  expect(profiles[0]?.body).toBe("Project body.");
});

it("lets a project profile replace a broken global one", () => {
  writeProfile("worker.md", "---\nname: worker\nthinking: sometimes\n---\n\nGlobal body.\n");
  writeProjectProfile("local.md", "---\nname: worker\nthinking: high\n---\n\nProject body.\n");

  expect(catalog({ trusted: true })).toMatchObject({ profiles: [{ name: "worker", thinking: "high" }], problems: [] });
});

it("rejects duplicate names in the same layer", () => {
  const first = writeProfile("first.md", "---\nname: worker\ndescription: First\n---\n\nFirst body.\n");
  const second = writeProfile("second.md", "---\nname: worker\ndescription: Second\n---\n\nSecond body.\n");

  const { profiles, problems } = catalog();

  expect(profiles).toEqual([]);
  expect(problems).toEqual([
    {
      name: "worker",
      file: first,
      field: "name",
      reason: `duplicate profile name; also in ${second}`,
    },
    {
      name: "worker",
      file: second,
      field: "name",
      reason: `duplicate profile name; also in ${first}`,
    },
  ]);
});

it("lets a broken project layer shadow a valid global profile", () => {
  writeProfile("worker.md", "---\nname: worker\ndescription: Global\n---\n\nGlobal body.\n");
  writeProjectProfile("first.md", "---\nname: worker\n---\n\nFirst body.\n");
  writeProjectProfile("second.md", "---\nname: worker\n---\n\nSecond body.\n");

  const { profiles, problems } = catalog({ trusted: true });

  expect(profiles).toEqual([]);
  expect(problems).toHaveLength(2);
  expect(problems.every((problem) => problem.name === "worker" && problem.field === "name")).toBe(true);
});

it("sorts profiles by name", () => {
  writeProfile("z-file.md", "---\nname: zeta\n---\n\nZeta body.\n");
  writeProfile("a-file.md", "---\nname: alpha\n---\n\nAlpha body.\n");
  writeProfile("notes.txt", "not a profile");

  expect(catalog().profiles.map((profile) => profile.name)).toEqual(["alpha", "zeta"]);
});
