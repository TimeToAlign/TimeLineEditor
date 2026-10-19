import { describe, expect, it } from "vitest";
import { affectedBy } from "../src/affected.ts";
import { A, blockIn, CHILD_MEMBER, load, MPM, numbersView } from "./support.ts";

const marks = (id: string) => [`${id}/start`, `${id}/start/label`, `${id}/end`, `${id}/end/label`];

describe("affectedBy", () => {
  it.each<[string, string[], string[]]>([
    ["nested", ["clt_3"], ["clt_2", "clt_2/name"]],
    ["nested", ["clt_2"], []],
    ["nested", ["clt_3/name"], ["clt_3", "clt_2", "clt_2/name"]],
    ["nested", ["clt_1"], ["clt_3", "clt_3/name", "clt_2", "clt_2/name"]],
    [
      "nested",
      ["clt_1/start"],
      [
        "clt_1/card",
        "clt_1",
        "clt_1/name",
        "clt_1/start/label",
        "clt_1/end",
        "clt_1/end/label",
        "clt_3",
        "clt_3/name",
        "clt_2",
        "clt_2/name",
      ],
    ],
    ["map", ["phrase"], ["melody/ticks"]],
    ["map", ["melody/tempo"], []],
    ["with_region", ["clt_1/region_1/label"], ["clt_1/region_1"]],
    ["nested", [], []],
  ])("%s with %j selected affects %j", (fixture, selected, expected) => {
    expect(affectedBy(load(fixture), new Set(selected))).toEqual(new Set(expected));
  });

  it.each<[string, string[], string[]]>([
    ["numbers", ["score/region_1/label"], ["score/region_1"]],
    ["numbers", ["score/region_1"], []],
    ["numbers", ["score"], ["score/region_1", "score/region_1/label"]],
    [
      CHILD_MEMBER,
      ["piece"],
      ["second-half/card", ...marks("second-half"), "second-half", "second-half/name"],
    ],
    [CHILD_MEMBER, ["recording/card"], ["recording", "recording/name", ...marks("recording")]],
    [MPM, ["group_1"], []],
    [MPM, ["group_1/name"], ["group_1"]],
    [MPM, ["name"], []],
  ])("with several roots, %s with %j selected affects %j", (fixture, selected, expected) => {
    const manifest = fixture === "numbers" ? blockIn(numbersView(), A).manifest : load(fixture);
    expect(affectedBy(manifest, new Set(selected))).toEqual(new Set(expected));
  });
});
