import type { Selector } from "@timetoalign/timeskeleton";
import { describe, expect, it } from "vitest";
import { manifestElements, selectorMatches, timelineAncestry } from "../src/index.ts";
import { load, manifestFixtures } from "./support.ts";

const CLT = "ContinuousLogicalTimeline";

describe("the elements of a manifest", () => {
  it("enumerates map.json in tree order", () => {
    const melody = ["melody", "logical", "continuous", CLT] as const;
    const phrase = ["phrase", "logical", "continuous", CLT] as const;
    expect(
      manifestElements(load("map.json")).map((key) => [
        key.type,
        key.address,
        key.timeline,
        key.domain,
        key.modality,
        key.class,
      ]),
    ).toEqual([
      ["block", null, null, null, null, null],
      ["timeline", "melody", ...melody],
      ["name", "melody/name", ...melody],
      ["map", "tempo", "melody", "physical", "continuous", "ScalarMap"],
      ["wedge", "melody/start", ...melody],
      ["label", "melody/start/label", ...melody],
      ["wedge", "melody/end", ...melody],
      ["label", "melody/end/label", ...melody],
      ["child", "phrase", ...phrase],
      ["name", "phrase/name", ...phrase],
      ["map", "ticks", "phrase", "logical", "discrete", "QuartersToTicks"],
    ]);
  });

  it("gives regions, breaks and jumps their drawn addresses, each with a label", () => {
    const addresses = (name: string) =>
      manifestElements(load(name))
        .filter((key) => ["region", "break", "jump"].includes(key.type))
        .map((key) => key.address);
    expect(addresses("with_region.json")).toEqual(["region_1"]);
    expect(addresses("flow_control.json")).toEqual(["break_1", "jump_1"]);
    const labels = manifestElements(load("flow_control.json"))
      .filter((key) => key.type === "label")
      .map((key) => key.address);
    expect(labels).toEqual([
      "break_1/label",
      "jump_1/label",
      "flow:quarters/start/label",
      "flow:quarters/end/label",
    ]);
  });

  it("enumerates every fixture with unique addresses", () => {
    for (const fixture of manifestFixtures) {
      const addresses = manifestElements(load(fixture.name)).map((key) => key.address);
      expect(new Set(addresses).size).toBe(addresses.length);
    }
  });
});

describe("selector matching", () => {
  const manifest = load("map.json");
  const keys = manifestElements(manifest);
  const ancestry = timelineAncestry(manifest);
  const matched = (select: Selector) =>
    keys.filter((key) => selectorMatches(select, key, ancestry)).map((key) => key.address);

  it.each([
    [{ element: "map", domain: "physical" }, ["tempo"]],
    [{ within: "phrase" }, ["phrase", "phrase/name", "ticks"]],
    [{ ids: ["tempo"] }, ["tempo"]],
    [{ class: "QuartersToTicks" }, ["ticks"]],
    [{ modality: "discrete" }, ["ticks"]],
  ] as [Selector, string[]][])("%j", (select, expected) => {
    expect(matched(select)).toEqual(expected);
  });

  it("matches everything with the empty selector", () => {
    expect(matched({})).toEqual(keys.map((key) => key.address));
    expect(keys.length).toBe(11);
  });
});
