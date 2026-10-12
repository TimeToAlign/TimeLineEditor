import { describe, expect, it } from "vitest";
import { affectedBy } from "../src/index.ts";
import { load } from "./support.ts";

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
});
