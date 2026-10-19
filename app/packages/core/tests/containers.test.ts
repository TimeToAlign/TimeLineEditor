import { describe, expect, it } from "vitest";
import type { ContainerRef } from "../src/manifest/containers.ts";
import {
  CARD_PLACE_MEMBERS,
  CONTAINERS,
  containersOf,
  holdingOf,
  ITEM_PLACE_MEMBERS,
  isMember,
  keptPlace,
  placeMembersOf,
} from "../src/manifest/containers.ts";
import { load } from "./support.ts";

const MIXED = "bundles/bundle_mixed.json";
const SHARED = "bundles/bundle_shared_parent.json";

/** A container as `[kind, address, the holder's address]`, the box's address written `box`. */
const row = (ref: ContainerRef) => [ref.kind, ref.address, ref.holder?.address ?? "box"];

/** The frames and cards of a listing in its order, bands left out. */
const items = (refs: Iterable<ContainerRef>) =>
  [...refs].filter((ref) => ref.kind !== "band").map(row);

describe("the registry", () => {
  it("states each kind's level, style element and place members", () => {
    expect(CONTAINERS).toEqual({
      box: { kind: "box", level: "bundle", element: "block", place: null },
      frame: {
        kind: "frame",
        level: "group",
        element: "group",
        place: { box: ITEM_PLACE_MEMBERS, frame: [] },
      },
      card: {
        kind: "card",
        level: "timeline",
        element: "card",
        place: { box: ITEM_PLACE_MEMBERS, frame: CARD_PLACE_MEMBERS },
      },
      band: { kind: "band", level: "feature", element: "band", place: null },
    });
  });
});

describe("the containers of a manifest", () => {
  it("lists frames and cards in drawing order, each with its holder", () => {
    // Groups by id; members in display order (`graphical.order`); then the
    // ungrouped roots. `recording` holds the member `excerpt`, so it is drawn
    // as an ancestor line only and has no card.
    expect(items(containersOf(load(MIXED)).byAddress.values())).toEqual([
      ["frame", "group_1", "box"],
      ["card", "score/card", "group_1"],
      ["card", "performance/card", "group_1"],
      ["frame", "group_2", "box"],
      ["card", "page/card", "group_2"],
      ["card", "excerpt/card", "group_2"],
      ["card", "annotations/card", "box"],
    ]);
  });

  it("keys frames by group id and cards by timeline id, the places keys", () => {
    const { byKey, box } = containersOf(load(MIXED));
    expect([...byKey.keys()]).toEqual([
      "group_1",
      "score",
      "performance",
      "group_2",
      "page",
      "excerpt",
      "annotations",
    ]);
    expect(row(box)).toEqual(["box", null, "box"]);
    expect(box.holder).toBeNull();
  });

  it("follows each card with its timeline's five bands", () => {
    const refs = [...containersOf(load(MIXED)).byAddress.values()];
    const at = refs.findIndex((ref) => ref.address === "score/card");
    expect(refs.slice(at, at + 6).map(row)).toEqual([
      ["card", "score/card", "group_1"],
      ["band", "score/children_1", "score/card"],
      ["band", "score/conversion_maps_1", "score/card"],
      ["band", "score/markers_1", "score/card"],
      ["band", "score/regions_1", "score/card"],
      ["band", "score/flow_control_1", "score/card"],
    ]);
    expect(refs[at + 1]).toMatchObject({ key: null, timeline: "score", band: "children" });
  });

  it("gives no bands to a timeline drawn in no card", () => {
    const { byAddress } = containersOf(load(MIXED));
    expect(byAddress.get("excerpt/regions_1")?.holder?.address).toBe("excerpt/card");
    expect(byAddress.has("recording/regions_1")).toBe(false);
    expect(byAddress.has("recording/card")).toBe(false);
  });

  it("holds a child's bands in the card of its nearest ancestor drawn in one", () => {
    // `score` holds the members `exposition` and `recapitulation` and is drawn
    // in no card; its descendants' bands lie in their member's card.
    const { byAddress } = containersOf(load(SHARED));
    const holder = (address: string) => byAddress.get(address)?.holder?.address;
    expect(holder("exposition_first/regions_1")).toBe("exposition/card");
    expect(holder("exposition/children_1")).toBe("exposition/card");
    expect(holder("recapitulation_second_2/markers_1")).toBe("recapitulation/card");
    expect(holder("recapitulation_first/conversion_maps_1")).toBe("recapitulation/card");
    expect(holder("take_1_first/children_1")).toBe("take_1/card");
    expect(byAddress.has("score/regions_1")).toBe(false);
    expect(items(byAddress.values())).toEqual([
      ["frame", "group_1", "box"],
      ["card", "exposition/card", "group_1"],
      ["card", "take_1/card", "group_1"],
      ["frame", "group_2", "box"],
      ["card", "recapitulation/card", "group_2"],
      ["card", "take_2/card", "group_2"],
      ["card", "page/card", "box"],
    ]);
    // Fifteen timelines are drawn in a card: exposition with its two
    // segments, recapitulation with its two segment lines and their four
    // segments, take_1 with its two segments, take_2 and page.
    expect(byAddress.size).toBe(2 + 5 + 15 * 5);
  });

  it("is memoised by manifest identity", () => {
    const manifest = load(MIXED);
    expect(containersOf(manifest)).toBe(containersOf(manifest));
  });
});

describe("place members by holding", () => {
  const { byKey, byAddress, box } = containersOf(load(MIXED));
  const ref = (key: string) => byKey.get(key) as ContainerRef;

  it("lets a frame and a box-held card state a whole place, a frame-held card its size", () => {
    expect([holdingOf(ref("group_1")), placeMembersOf(ref("group_1"))]).toEqual([
      "box",
      ITEM_PLACE_MEMBERS,
    ]);
    expect([holdingOf(ref("annotations")), placeMembersOf(ref("annotations"))]).toEqual([
      "box",
      ITEM_PLACE_MEMBERS,
    ]);
    expect([holdingOf(ref("score")), placeMembersOf(ref("score"))]).toEqual([
      "frame",
      CARD_PLACE_MEMBERS,
    ]);
    const band = byAddress.get("score/regions_1") as ContainerRef;
    expect([holdingOf(band), placeMembersOf(band)]).toEqual([null, []]);
    expect([holdingOf(box), placeMembersOf(box)]).toEqual([null, []]);
  });

  it("cuts a place to what its container may state", () => {
    const item = { x: 4, width: 120 };
    expect(keptPlace(ref("annotations"), item)).toBe(item);
    expect(keptPlace(ref("score"), item)).toEqual({ width: 120 });
    expect(keptPlace(ref("score"), { x: 4, scale: 2 })).toBeUndefined();
  });

  it("tells a group member by the frame holding its card", () => {
    const manifest = load(MIXED);
    expect(
      ["score", "excerpt", "annotations", "recording", "group_1"].map((id) =>
        isMember(manifest, id),
      ),
    ).toEqual([true, true, false, false, false]);
  });
});
