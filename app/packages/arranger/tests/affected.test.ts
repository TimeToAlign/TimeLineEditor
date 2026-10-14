import { describe, expect, it } from "vitest";
import { affectedBy } from "../src/index.ts";
import { A, blockIn, CHILD_MEMBER, load, MPM, numbersView } from "./support.ts";

describe("affectedBy", () => {
  it.each<[string, string[], string[]]>([
    ["nested", ["clt_3"], ["clt_2", "clt_2/name"]],
    ["nested", ["clt_2"], []],
    ["nested", ["clt_3/name"], ["clt_3", "clt_2", "clt_2/name"]],
    ["nested", ["clt_1"], []],
    ["nested", ["clt_1/start"], []],
    ["map", ["phrase"], ["ticks"]],
    ["map", ["tempo"], []],
    ["with_region", ["region_1/label"], ["region_1"]],
    ["nested", [], []],
  ])("%s with %j selected affects %j", (fixture, selected, expected) => {
    expect(affectedBy(load(fixture), new Set(selected))).toEqual(new Set(expected));
  });

  it.each<[string, string[], string[]]>([
    ["numbers", ["score/region_1/label"], ["score/region_1"]],
    ["numbers", ["score/region_1"], []],
    ["numbers", ["score"], []],
    [CHILD_MEMBER, ["piece"], []],
    [MPM, ["score:clt_1"], []],
    [MPM, ["group_1"], []],
    [MPM, ["group_1/name"], []],
    [MPM, ["bundle_1/name"], []],
  ])("in a group or bundle file, %s with %j selected affects %j", (fixture, selected, expected) => {
    const manifest = fixture === "numbers" ? blockIn(numbersView(), A).manifest : load(fixture);
    expect(affectedBy(manifest, new Set(selected))).toEqual(new Set(expected));
  });
});
