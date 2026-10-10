import { describe, expect, it } from "vitest";
import { writeSvg, writeTikz } from "../src/index.ts";
import { geometry, golden, specimens } from "./support.ts";

describe("the golden figures", () => {
  it("exist for the twenty golden geometries", () => {
    expect(specimens()).toHaveLength(20);
  });

  it.each(specimens())("are reproduced byte for byte for %s", (name) => {
    expect(writeSvg(geometry(name))).toBe(golden(name, "figure.svg"));
    expect(writeTikz(geometry(name))).toBe(golden(name, "figure.tex"));
  });
});
