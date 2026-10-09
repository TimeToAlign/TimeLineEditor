import { expect, it } from "vitest";
import { name } from "../src/index.ts";

it("exports its package name", () => {
  expect(name).toBe("@timetoalign/tilie-layout");
});
