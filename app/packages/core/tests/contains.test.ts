import { describe, expect, it } from "vitest";
import { contains } from "../src/manifest/contains.ts";
import { manifestElements } from "../src/manifest/elements.ts";
import { load } from "./support.ts";

const mixed = load("bundles/bundle_mixed.json");

/** The addresses of the manifest's enumeration that `container` contains, in its order. */
const containedBy = (container: string) =>
  manifestElements(mixed)
    .map((key) => key.address)
    .filter((address): address is string => address !== null)
    .filter((address) => contains(mixed, container, address));

const wedges = (id: string) => [`${id}/start`, `${id}/start/label`, `${id}/end`, `${id}/end/label`];

/** The five bands of the timeline `id`, each followed by what it holds: its maps, its wedges. */
const bands = (id: string, maps: readonly string[]) => [
  `${id}/children_1`,
  `${id}/conversion_maps_1`,
  ...maps,
  `${id}/markers_1`,
  ...wedges(id),
  `${id}/regions_1`,
  `${id}/flow_control_1`,
];

describe("contains", () => {
  it("holds a group's frame, title and what its members hold, never their ancestors", () => {
    expect(containedBy("group_2")).toEqual([
      "group_2",
      "group_2/name",
      "group_2/page/card",
      "page",
      "page/name",
      ...bands("page", ["page/cmap_1"]),
      "group_2/excerpt/card",
      ...wedges("excerpt"),
      "excerpt",
      "excerpt/name",
      ...bands("excerpt", ["recording/cmap_2"]),
    ]);
    expect(contains(mixed, "group_1", "group_2")).toBe(false);
    expect(contains(mixed, "group_1", "annotations/card")).toBe(false);
  });

  it("holds in a root everything of its descendants, its ancestor line included", () => {
    expect(containedBy("recording")).toEqual([
      "group_2/excerpt/card",
      "recording",
      "recording/name",
      ...wedges("excerpt"),
      "excerpt",
      "excerpt/name",
      ...bands("excerpt", ["recording/cmap_2"]),
    ]);
  });

  it("leaves an ancestor line and the ancestor's own map outside a child", () => {
    expect(containedBy("excerpt")).toEqual([
      "group_2/excerpt/card",
      ...wedges("excerpt"),
      "excerpt",
      "excerpt/name",
      ...bands("excerpt", ["recording/cmap_2"]),
    ]);
    expect(contains(mixed, "excerpt", "recording/cmap_1")).toBe(false);
    expect(contains(mixed, "recording", "recording/cmap_1")).toBe(true);
  });

  it("gives an entry to the timeline holding it", () => {
    const map = load("map.json");
    expect(contains(map, "phrase", "melody/ticks")).toBe(true);
    expect(contains(map, "phrase", "melody/tempo")).toBe(false);
    expect(contains(map, "melody", "melody/tempo")).toBe(true);
    expect(contains(map, "melody", "melody/ticks")).toBe(true);
    expect(contains(map, "melody", "phrase/name")).toBe(true);
  });

  it("contains nothing in anything else, and nothing holds the title or an unknown address", () => {
    const map = load("map.json");
    for (const container of ["name", "melody/tempo", "melody/card", "nothing"]) {
      expect(contains(map, container, container)).toBe(false);
      expect(contains(map, container, "melody")).toBe(false);
    }
    for (const container of ["melody", "phrase"]) {
      expect(contains(map, container, "name")).toBe(false);
      expect(contains(map, container, "nothing")).toBe(false);
    }
    expect(contains(mixed, "group_1", "name")).toBe(false);
  });
});
