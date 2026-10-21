import { describe, expect, it } from "vitest";
import type { ContainerRef, PlaceKey, Places } from "../src/manifest/containers.ts";
import {
  CARD_PLACE_MEMBERS,
  CONTAINER_KINDS,
  CONTAINERS,
  containersOf,
  holdingOf,
  ITEM_PLACE_MEMBERS,
  isMember,
  keptPlace,
  placeAt,
  placedContainer,
  placedElement,
  placeEntries,
  placeKeyText,
  placeMembersOf,
  samePlaceKey,
  withPlaceAt,
} from "../src/manifest/containers.ts";
import { resolveElement } from "../src/workspace/address.ts";
import { load } from "./support.ts";

const MIXED = "bundles/bundle_mixed.json";
const SHARED = "bundles/bundle_shared_parent.json";
const SHARED_MEMBER = "bundles/bundle_shared_member.json";

/** A frame or card as `[kind, its place key, the holder's place key]`, the block's written `null`. */
const row = (ref: ContainerRef) => [ref.kind, ref.key, ref.holder?.key ?? null];

/** The frames and cards of a listing in its order, bands left out. */
const items = (refs: Iterable<ContainerRef>) =>
  [...refs].filter((ref) => ref.kind !== "band").map(row);

/** The place keys of the cards holding every drawing of the band of `facet` of `timeline`. */
const holders = (
  bands: ReturnType<typeof containersOf>["bands"],
  timeline: string,
  facet: "children" | "conversion_maps" | "markers" | "regions" | "flow_control",
) => (bands.get(timeline)?.get(facet) ?? []).map((ref) => ref.holder?.key);

describe("the registry", () => {
  it("states each kind's level, style element and place members", () => {
    expect(CONTAINER_KINDS).toEqual(["block", "frame", "card", "band"]);
    expect(CONTAINERS).toEqual({
      block: { kind: "block", level: "bundle", element: "block", place: null },
      frame: {
        kind: "frame",
        level: "group",
        element: "frame",
        place: { block: ITEM_PLACE_MEMBERS, frame: [] },
      },
      card: {
        kind: "card",
        level: "timeline",
        element: "card",
        place: { block: ITEM_PLACE_MEMBERS, frame: CARD_PLACE_MEMBERS },
      },
      band: { kind: "band", level: "facet", element: "band", place: null },
    });
  });
});

describe("the containers of a manifest", () => {
  it("lists frames and cards in drawing order, each with its holder", () => {
    // Groups by ID; members in display order (`graphical.order`); then the
    // ungrouped roots. `recording` holds the member `excerpt`, so it is drawn
    // as an ancestor line only and has no card.
    expect(items(containersOf(load(MIXED)).all)).toEqual([
      ["frame", { item: "group_1" }, null],
      ["card", { item: "group_1", member: "score" }, { item: "group_1" }],
      ["card", { item: "group_1", member: "performance" }, { item: "group_1" }],
      ["frame", { item: "group_2" }, null],
      ["card", { item: "group_2", member: "page" }, { item: "group_2" }],
      ["card", { item: "group_2", member: "excerpt" }, { item: "group_2" }],
      ["card", { item: "annotations" }, null],
    ]);
  });

  it("addresses a frame by its group, a card by its timeline, and keys both by their place", () => {
    const { all, byKey, frames, cards, block } = containersOf(load(MIXED));
    expect([...byKey.keys()]).toEqual([
      '["group_1"]',
      '["group_1","score"]',
      '["group_1","performance"]',
      '["group_2"]',
      '["group_2","page"]',
      '["group_2","excerpt"]',
      '["annotations"]',
    ]);
    expect(
      all.filter((ref) => ref.kind !== "band").map((ref) => [ref.address, ref.timeline]),
    ).toEqual([
      [{ id: "group_1" }, null],
      [{ id: "score", part: ["card"] }, "score"],
      [{ id: "performance", part: ["card"] }, "performance"],
      [{ id: "group_2" }, null],
      [{ id: "page", part: ["card"] }, "page"],
      [{ id: "excerpt", part: ["card"] }, "excerpt"],
      [{ id: "annotations", part: ["card"] }, "annotations"],
    ]);
    expect([...frames.keys()]).toEqual(["group_1", "group_2"]);
    expect([...cards.keys()]).toEqual(["score", "performance", "page", "excerpt", "annotations"]);
    expect(block).toEqual({
      kind: "block",
      key: null,
      address: {},
      holder: null,
      timeline: null,
      facet: null,
    });
  });

  it("follows each card with its timeline's five bands", () => {
    const { all } = containersOf(load(MIXED));
    const at = all.findIndex((ref) => ref.kind === "card" && ref.timeline === "score");
    expect(all.slice(at, at + 6).map((ref) => [ref.kind, ref.address, ref.holder?.key])).toEqual([
      ["card", { id: "score", part: ["card"] }, { item: "group_1" }],
      ["band", { id: "score", facet: "children" }, { item: "group_1", member: "score" }],
      ["band", { id: "score", facet: "conversion_maps" }, { item: "group_1", member: "score" }],
      ["band", { id: "score", facet: "markers" }, { item: "group_1", member: "score" }],
      ["band", { id: "score", facet: "regions" }, { item: "group_1", member: "score" }],
      ["band", { id: "score", facet: "flow_control" }, { item: "group_1", member: "score" }],
    ]);
    expect(all[at + 1]).toMatchObject({ key: null, timeline: "score", facet: "children" });
  });

  it("gives no bands to a timeline drawn in no card", () => {
    const { bands, cards } = containersOf(load(MIXED));
    expect(holders(bands, "excerpt", "regions")).toEqual([{ item: "group_2", member: "excerpt" }]);
    expect(bands.has("recording")).toBe(false);
    expect(cards.has("recording")).toBe(false);
  });

  it("holds a child's bands in the card of its nearest ancestor drawn in one", () => {
    // `score` holds the members `exposition` and `recapitulation` and is drawn
    // in no card; its descendants' bands lie in their member's card.
    const { all, bands } = containersOf(load(SHARED));
    const exposition = { item: "group_1", member: "exposition" };
    const recapitulation = { item: "group_2", member: "recapitulation" };
    expect(holders(bands, "exposition_first", "regions")).toEqual([exposition]);
    expect(holders(bands, "exposition", "children")).toEqual([exposition]);
    expect(holders(bands, "recapitulation_second_2", "markers")).toEqual([recapitulation]);
    expect(holders(bands, "recapitulation_first", "conversion_maps")).toEqual([recapitulation]);
    expect(holders(bands, "take_1_first", "children")).toEqual([
      { item: "group_1", member: "take_1" },
    ]);
    expect(bands.has("score")).toBe(false);
    expect(items(all)).toEqual([
      ["frame", { item: "group_1" }, null],
      ["card", exposition, { item: "group_1" }],
      ["card", { item: "group_1", member: "take_1" }, { item: "group_1" }],
      ["frame", { item: "group_2" }, null],
      ["card", recapitulation, { item: "group_2" }],
      ["card", { item: "group_2", member: "take_2" }, { item: "group_2" }],
      ["card", { item: "page" }, null],
    ]);
    // Fifteen timelines are drawn in a card: exposition with its two
    // segments, recapitulation with its two segment lines and their four
    // segments, take_1 with its two segments, take_2 and page.
    expect(all.length).toBe(2 + 5 + 15 * 5);
    expect(bands.size).toBe(15);
  });

  it("draws a timeline in several groups in a card of each, all under one address", () => {
    const manifest = load(SHARED_MEMBER);
    const { all, byKey, cards } = containersOf(manifest);
    const g1t = { item: "g1", member: "t" };
    const g2t = { item: "g2", member: "t" };
    expect(items(all)).toEqual([
      ["frame", { item: "g1" }, null],
      ["card", g1t, { item: "g1" }],
      ["card", { item: "g1", member: "u" }, { item: "g1" }],
      ["frame", { item: "g2" }, null],
      ["card", g2t, { item: "g2" }],
      ["card", { item: "g2", member: "v" }, { item: "g2" }],
    ]);
    expect([...byKey.keys()]).toEqual([
      '["g1"]',
      '["g1","t"]',
      '["g1","u"]',
      '["g2"]',
      '["g2","t"]',
      '["g2","v"]',
    ]);
    expect((cards.get("t") ?? []).map((card) => [card.key, card.address])).toEqual([
      [g1t, { id: "t", part: ["card"] }],
      [g2t, { id: "t", part: ["card"] }],
    ]);
    const { bands } = containersOf(manifest);
    for (const facet of ["children", "conversion_maps", "markers", "regions", "flow_control"]) {
      expect(holders(bands, "t", facet as "regions")).toEqual([g1t, g2t]);
    }
    expect(holders(bands, "u", "regions")).toEqual([{ item: "g1", member: "u" }]);
    expect(isMember(manifest, "t")).toBe(true);
    const shape = (id: string, more: object = {}) => {
      const found = resolveElement(manifest, { id, ...more });
      switch (found?.kind) {
        case "timeline":
        case "card":
          return [found.kind, found.cards.map((card) => card.key)];
        case "band":
          return [found.kind, found.containers.map((band) => band.holder?.key)];
        default:
          return found?.kind;
      }
    };
    expect([
      shape("t"),
      shape("t", { part: ["card"] }),
      shape("u", { part: ["card"] }),
      shape("t", { facet: "regions" }),
      shape("g1", { part: ["card"] }),
    ]).toEqual([
      ["timeline", [g1t, g2t]],
      ["card", [g1t, g2t]],
      ["card", [{ item: "g1", member: "u" }]],
      ["band", [g1t, g2t]],
      undefined,
    ]);
  });

  it("is memoised by manifest identity", () => {
    const manifest = load(MIXED);
    expect(containersOf(manifest)).toBe(containersOf(manifest));
  });
});

describe("place members by holding", () => {
  const manifest = load(MIXED);
  const { block, bands } = containersOf(manifest);
  const ref = (key: PlaceKey) => placedContainer(manifest, key) as ContainerRef;
  const [regions] = bands.get("score")?.get("regions") ?? [];

  it("lets a frame and a block-held card state a whole place, a frame-held card its size", () => {
    expect(
      [{ item: "group_1" }, { item: "annotations" }, { item: "group_1", member: "score" }].map(
        (key) => [holdingOf(ref(key)), placeMembersOf(ref(key))],
      ),
    ).toEqual([
      ["block", ITEM_PLACE_MEMBERS],
      ["block", ITEM_PLACE_MEMBERS],
      ["frame", CARD_PLACE_MEMBERS],
    ]);
    const band = regions as ContainerRef;
    expect([holdingOf(band), placeMembersOf(band)]).toEqual([null, []]);
    expect([holdingOf(block), placeMembersOf(block)]).toEqual([null, []]);
  });

  it("cuts a place to what its container may state", () => {
    const item = { x: 4, width: 120 };
    const member = { item: "group_1", member: "score" };
    expect(keptPlace(ref({ item: "annotations" }), item)).toBe(item);
    expect(keptPlace(ref(member), item)).toEqual({ width: 120 });
    expect(keptPlace(ref(member), { x: 4, scale: 2 })).toBeUndefined();
  });

  it("tells a group member by the frame holding its card", () => {
    expect(
      ["score", "excerpt", "annotations", "recording", "group_1"].map((id) =>
        isMember(manifest, id),
      ),
    ).toEqual([true, true, false, false, false]);
  });
});

describe("places", () => {
  const places: Places = {
    group_1: { x: 10, cards: { score: { width: 650 } } },
    annotations: { y: 4 },
    group_2: { cards: { page: { height: 80 } } },
  };

  it("write a place key as its item and member", () => {
    expect(placeKeyText({ item: "group_1" })).toBe('["group_1"]');
    expect(placeKeyText({ item: "group_1", member: "score" })).toBe('["group_1","score"]');
    expect(placeKeyText({ item: "a/b" })).not.toBe(placeKeyText({ item: "a", member: "b" }));
    expect(
      [
        [{ item: "g" }, { item: "g" }],
        [
          { item: "g", member: "t" },
          { item: "g", member: "t" },
        ],
        [{ item: "g" }, { item: "g", member: "t" }],
        [
          { item: "g", member: "t" },
          { item: "g", member: "u" },
        ],
      ].map(([left, right]) => samePlaceKey(left as PlaceKey, right as PlaceKey)),
    ).toEqual([true, true, false, false]);
  });

  it("read an item's own place without its cards, and a member's card's place", () => {
    expect(
      [
        { item: "group_1" },
        { item: "group_1", member: "score" },
        { item: "group_1", member: "performance" },
        { item: "group_2" },
        { item: "group_2", member: "page" },
        { item: "annotations" },
        { item: "annotations", member: "score" },
        { item: "nothing" },
        { item: "constructor" },
      ].map((key) => placeAt(places, key)),
    ).toEqual([
      { x: 10 },
      { width: 650 },
      undefined,
      undefined,
      { height: 80 },
      { y: 4 },
      undefined,
      undefined,
      undefined,
    ]);
  });

  it("replace or remove one place, an item's own members before its cards", () => {
    const replaced = withPlaceAt(places, { item: "group_1" }, { length: 300 });
    expect(replaced).toEqual({
      group_1: { length: 300, cards: { score: { width: 650 } } },
      annotations: { y: 4 },
      group_2: { cards: { page: { height: 80 } } },
    });
    expect(Object.keys(replaced.group_1 ?? {})).toEqual(["length", "cards"]);
    expect(withPlaceAt(places, { item: "group_1" }, undefined)).toEqual({
      group_1: { cards: { score: { width: 650 } } },
      annotations: { y: 4 },
      group_2: { cards: { page: { height: 80 } } },
    });
    expect(withPlaceAt(places, { item: "group_1", member: "score" }, undefined)).toEqual({
      group_1: { x: 10 },
      annotations: { y: 4 },
      group_2: { cards: { page: { height: 80 } } },
    });
    expect(withPlaceAt(places, { item: "group_2", member: "page" }, undefined)).toEqual({
      group_1: { x: 10, cards: { score: { width: 650 } } },
      annotations: { y: 4 },
    });
    expect(withPlaceAt(places, { item: "group_1", member: "performance" }, { width: 1 })).toEqual({
      group_1: { x: 10, cards: { score: { width: 650 }, performance: { width: 1 } } },
      annotations: { y: 4 },
      group_2: { cards: { page: { height: 80 } } },
    });
    expect(withPlaceAt({}, { item: "g", member: "t" }, { width: 2 })).toEqual({
      g: { cards: { t: { width: 2 } } },
    });
    expect(withPlaceAt(places, { item: "annotations" }, undefined)).toEqual({
      group_1: { x: 10, cards: { score: { width: 650 } } },
      group_2: { cards: { page: { height: 80 } } },
    });
  });

  it("list every stated place with its key, an item's own before its cards", () => {
    expect(placeEntries(places)).toEqual([
      [{ item: "group_1" }, { x: 10 }],
      [{ item: "group_1", member: "score" }, { width: 650 }],
      [{ item: "annotations" }, { y: 4 }],
      [{ item: "group_2", member: "page" }, { height: 80 }],
    ]);
  });

  it("name the container and the element a place key places", () => {
    const manifest = load(MIXED);
    expect(placedContainer(manifest, { item: "group_1", member: "score" })).toMatchObject({
      kind: "card",
      timeline: "score",
    });
    expect(
      [
        { item: "group_1" },
        { item: "group_1", member: "score" },
        { item: "annotations" },
        { item: "score" },
        { item: "recording" },
        { item: "group_2", member: "score" },
      ].map((key) => placedElement(manifest, key)),
    ).toEqual(["group_1", "score", "annotations", undefined, undefined, undefined]);
  });
});
