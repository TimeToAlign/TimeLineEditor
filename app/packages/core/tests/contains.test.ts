import { describe, expect, it } from "vitest";
import type { ElementAddress, Facet, Part } from "../src/manifest/address.ts";
import { contains } from "../src/manifest/contains.ts";
import { manifestElements } from "../src/manifest/elements.ts";
import { load } from "./support.ts";

const mixed = load("bundles/bundle_mixed.yaml");

/** The addresses of the manifest's enumeration that `container` contains, in its order. */
const containedBy = (container: string) =>
  manifestElements(mixed)
    .map((key) => key.address)
    .filter((address) => contains(mixed, container, address));

const id = (value: string, ...part: Part[]): ElementAddress =>
  part.length === 0 ? { id: value } : { id: value, part };
const band = (timeline: string, facet: Facet): ElementAddress => ({ id: timeline, facet });

/** The marks of a member's start and end on an ancestor line, each with its label. */
const marks = (timeline: string) => [
  id(timeline, "start"),
  id(timeline, "start", "label"),
  id(timeline, "end"),
  id(timeline, "end", "label"),
];

/**
 * The five bands of the timeline `timeline`, each followed by what it holds: its maps; the
 * wedges and coordinate labels of its named timestamps `origin` and `length`, `stamps`.
 */
const bands = (timeline: string, maps: readonly string[], stamps: readonly string[]) => [
  band(timeline, "children"),
  band(timeline, "conversion_maps"),
  ...maps.map((map) => id(map)),
  band(timeline, "markers"),
  ...stamps.flatMap((stamp) => [id(stamp), id(stamp, "coordinate")]),
  band(timeline, "regions"),
  band(timeline, "flow_control"),
];

// The named timestamps `origin` and `length` of `excerpt` and `page`.
const EXCERPT = ["timestamp_3", "timestamp_4"];
const PAGE = ["timestamp_5", "timestamp_6"];

describe("contains", () => {
  it("holds a group's frame, title and what its members hold, never their ancestors", () => {
    expect(containedBy("group_2")).toEqual([
      id("group_2"),
      id("group_2", "name"),
      id("page", "card"),
      id("page"),
      id("page", "name"),
      ...bands("page", ["cmap_4"], PAGE),
      id("excerpt", "card"),
      ...marks("excerpt"),
      id("excerpt"),
      id("excerpt", "name"),
      ...bands("excerpt", ["cmap_6"], EXCERPT),
    ]);
    expect(contains(mixed, "group_1", id("group_2"))).toBe(false);
    expect(contains(mixed, "group_1", id("annotations", "card"))).toBe(false);
  });

  it("holds in a root everything of its descendants, its ancestor line included", () => {
    expect(containedBy("recording")).toEqual([
      id("excerpt", "card"),
      id("recording"),
      id("recording", "name"),
      ...marks("excerpt"),
      id("excerpt"),
      id("excerpt", "name"),
      ...bands("excerpt", ["cmap_6"], EXCERPT),
    ]);
  });

  it("leaves an ancestor line and the ancestor's own map outside a child", () => {
    expect(containedBy("excerpt")).toEqual([
      id("excerpt", "card"),
      ...marks("excerpt"),
      id("excerpt"),
      id("excerpt", "name"),
      ...bands("excerpt", ["cmap_6"], EXCERPT),
    ]);
    expect(contains(mixed, "excerpt", id("cmap_5"))).toBe(false);
    expect(contains(mixed, "recording", id("cmap_5"))).toBe(true);
    expect(contains(mixed, "excerpt", band("recording", "regions"))).toBe(false);
    expect(contains(mixed, "recording", band("recording", "regions"))).toBe(true);
  });

  it("gives an entry to the timeline holding it", () => {
    const map = load("map.yaml");
    expect(contains(map, "phrase", id("ticks"))).toBe(true);
    expect(contains(map, "phrase", id("tempo"))).toBe(false);
    expect(contains(map, "melody", id("tempo"))).toBe(true);
    expect(contains(map, "melody", id("ticks"))).toBe(true);
    expect(contains(map, "melody", id("phrase", "name"))).toBe(true);
    expect(contains(map, "melody", id("ticks", "label"))).toBe(true);
  });

  it("contains nothing in anything else, and nothing holds the title or an unknown address", () => {
    const map = load("map.yaml");
    for (const container of ["tempo", "nothing"]) {
      expect(contains(map, container, id(container))).toBe(false);
      expect(contains(map, container, id("melody"))).toBe(false);
    }
    for (const container of ["melody", "phrase"]) {
      expect(contains(map, container, { part: ["name"] })).toBe(false);
      expect(contains(map, container, {})).toBe(false);
      expect(contains(map, container, id("nothing"))).toBe(false);
    }
    expect(contains(mixed, "group_1", { part: ["name"] })).toBe(false);
  });
});
