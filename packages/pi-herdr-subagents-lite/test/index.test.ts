import { expect, it } from "vitest";

it("exports the extension factory", async () => {
  const { default: extension } = await import("../src/index.ts");

  expect(typeof extension).toBe("function");
});
