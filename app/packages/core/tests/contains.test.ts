import { describe, expect, it } from "vitest";
import { contains, manifestElements } from "../src/index.ts";
import { load } from "./support.ts";

const mixed = load("bundles/bundle_mixed.json");

/** The addresses of the manifest's enumeration that `container` contains, in its order. */
const containedBy = (container: string) =>
  manifestElements(mixed)
    .map((key) => key.address)
    .filter((address): address is string => address !== null)
    .filter((address) => contains(mixed, container, address));

const wedges = (id: string) => [`${id}/start`, `${id}/start/label`, `${id}/end`, `${id}/end/label`];

describe("contains", () => {
  it("holds a group's frame, title and what its members hold, never their ancestors", () => {
    expect(containedBy("group_2")).toEqual([
      "group_2",
      "group_2/name",
      "page/card",
      "page",
      "page/name",
      ...wedges("page"),
      "excerpt/card",
      ...wedges("excerpt"),
      "excerpt",
      "excerpt/name",
      ...wedges("excerpt"),
    ]);
    expect(contains(mixed, "group_1", "group_2")).toBe(false);
    expect(contains(mixed, "group_1", "annotations/card")).toBe(false);
  });

  it("holds in a root everything of its descendants, its ancestor line included", () => {
    expect(containedBy("recording")).toEqual([
      "excerpt/card",
      "recording",
      "recording/name",
      ...wedges("excerpt"),
      "excerpt",
      "excerpt/name",
      ...wedges("excerpt"),
    ]);
  });

  it("leaves an ancestor line outside a child", () => {
    expect(containedBy("excerpt")).toEqual([
      "excerpt/card",
      ...wedges("excerpt"),
      "excerpt",
      "excerpt/name",
      ...wedges("excerpt"),
    ]);
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
