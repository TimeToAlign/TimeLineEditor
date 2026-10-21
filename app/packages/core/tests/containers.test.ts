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
import { elementOf, resolveElement } from "../src/workspace/address.ts";
import { load } from "./support.ts";

const MIXED = "bundles/bundle_mixed.json";
const SHARED = "bundles/bundle_shared_parent.json";
const SHARED_MEMBER = "bundles/bundle_shared_member.json";

/** A container as `[kind, address, the holder's address]`, the box's address written `box`. */
const row = (ref: ContainerRef) => [ref.kind, ref.address, ref.holder?.address ?? "box"];

/** Every drawing listed by address, in the order the addresses were first listed. */
const drawn = (byAddress: ReadonlyMap<string, readonly ContainerRef[]>) =>
  [...byAddress.values()].flat();

/** The frames and cards of a listing in its order, bands left out. */
const items = (refs: Iterable<ContainerRef>) =>
  [...refs].filter((ref) => ref.kind !== "band").map(row);

/** The holders of every drawing of the container at `address`. */
const holders = (byAddress: ReadonlyMap<string, readonly ContainerRef[]>, address: string) =>
  (byAddress.get(address) ?? []).map((ref) => ref.holder?.address);

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
    expect(items(drawn(containersOf(load(MIXED)).byAddress))).toEqual([
      ["frame", "group_1", "box"],
      ["card", "group_1/score/card", "group_1"],
      ["card", "group_1/performance/card", "group_1"],
      ["frame", "group_2", "box"],
      ["card", "group_2/page/card", "group_2"],
      ["card", "group_2/excerpt/card", "group_2"],
      ["card", "annotations/card", "box"],
    ]);
  });

  it("keys frames by group id and cards by group and timeline id, the places keys", () => {
    const { byKey, box } = containersOf(load(MIXED));
    expect([...byKey.keys()]).toEqual([
      "group_1",
      "group_1/score",
      "group_1/performance",
      "group_2",
      "group_2/page",
      "group_2/excerpt",
      "annotations",
    ]);
    expect(row(box)).toEqual(["box", null, "box"]);
    expect(box.holder).toBeNull();
  });

  it("follows each card with its timeline's five bands", () => {
    const refs = drawn(containersOf(load(MIXED)).byAddress);
    const at = refs.findIndex((ref) => ref.address === "group_1/score/card");
    expect(refs.slice(at, at + 6).map(row)).toEqual([
      ["card", "group_1/score/card", "group_1"],
      ["band", "score/children_1", "group_1/score/card"],
      ["band", "score/conversion_maps_1", "group_1/score/card"],
      ["band", "score/markers_1", "group_1/score/card"],
      ["band", "score/regions_1", "group_1/score/card"],
      ["band", "score/flow_control_1", "group_1/score/card"],
    ]);
    expect(refs[at + 1]).toMatchObject({ key: null, timeline: "score", band: "children" });
  });

  it("gives no bands to a timeline drawn in no card", () => {
    const { byAddress, cards } = containersOf(load(MIXED));
    expect(holders(byAddress, "excerpt/regions_1")).toEqual(["group_2/excerpt/card"]);
    expect(byAddress.has("recording/regions_1")).toBe(false);
    expect(byAddress.has("recording/card")).toBe(false);
    expect(cards.has("recording")).toBe(false);
  });

  it("holds a child's bands in the card of its nearest ancestor drawn in one", () => {
    // `score` holds the members `exposition` and `recapitulation` and is drawn
    // in no card; its descendants' bands lie in their member's card.
    const { byAddress } = containersOf(load(SHARED));
    const holder = (address: string) => holders(byAddress, address);
    expect(holder("exposition_first/regions_1")).toEqual(["group_1/exposition/card"]);
    expect(holder("exposition/children_1")).toEqual(["group_1/exposition/card"]);
    expect(holder("recapitulation_second_2/markers_1")).toEqual(["group_2/recapitulation/card"]);
    expect(holder("recapitulation_first/conversion_maps_1")).toEqual([
      "group_2/recapitulation/card",
    ]);
    expect(holder("take_1_first/children_1")).toEqual(["group_1/take_1/card"]);
    expect(byAddress.has("score/regions_1")).toBe(false);
    expect(items(drawn(byAddress))).toEqual([
      ["frame", "group_1", "box"],
      ["card", "group_1/exposition/card", "group_1"],
      ["card", "group_1/take_1/card", "group_1"],
      ["frame", "group_2", "box"],
      ["card", "group_2/recapitulation/card", "group_2"],
      ["card", "group_2/take_2/card", "group_2"],
      ["card", "page/card", "box"],
    ]);
    // Fifteen timelines are drawn in a card: exposition with its two
    // segments, recapitulation with its two segment lines and their four
    // segments, take_1 with its two segments, take_2 and page.
    expect(byAddress.size).toBe(2 + 5 + 15 * 5);
  });

  it("draws a timeline in several groups in a card of each, its bands in both", () => {
    const manifest = load(SHARED_MEMBER);
    const { byAddress, byKey, cards } = containersOf(manifest);
    expect(items(drawn(byAddress))).toEqual([
      ["frame", "g1", "box"],
      ["card", "g1/t/card", "g1"],
      ["card", "g1/u/card", "g1"],
      ["frame", "g2", "box"],
      ["card", "g2/t/card", "g2"],
      ["card", "g2/v/card", "g2"],
    ]);
    expect([...byKey.keys()]).toEqual(["g1", "g1/t", "g1/u", "g2", "g2/t", "g2/v"]);
    expect((cards.get("t") ?? []).map((card) => card.address)).toEqual(["g1/t/card", "g2/t/card"]);
    for (const band of ["children", "conversion_maps", "markers", "regions", "flow_control"]) {
      expect(holders(byAddress, `t/${band}_1`)).toEqual(["g1/t/card", "g2/t/card"]);
    }
    expect(holders(byAddress, "u/regions_1")).toEqual(["g1/u/card"]);
    expect(isMember(manifest, "t")).toBe(true);
    const shape = (address: string) => {
      const found = resolveElement(manifest, address);
      switch (found?.kind) {
        case "timeline":
          return [found.kind, found.cards.map((card) => card.address)];
        case "card":
          return [found.kind, found.at.timeline.id, found.container.address];
        case "band":
          return [found.kind, found.containers.map((band) => band.holder?.address)];
        default:
          return found?.kind;
      }
    };
    expect(
      ["t", "g1/t/card", "g2/t/card", "t/regions_1", "t/card", "g1/v/card"].map(shape),
    ).toEqual([
      ["timeline", ["g1/t/card", "g2/t/card"]],
      ["card", "t", "g1/t/card"],
      ["card", "t", "g2/t/card"],
      ["band", ["g1/t/card", "g2/t/card"]],
      undefined,
      undefined,
    ]);
    expect(elementOf(manifest, "g2/t/card")).toBe("t");
  });

  it("is memoised by manifest identity", () => {
    const manifest = load(MIXED);
    expect(containersOf(manifest)).toBe(containersOf(manifest));
  });
});

describe("place members by holding", () => {
  const { byKey, byAddress, box } = containersOf(load(MIXED));
  const ref = (key: string) => byKey.get(key) as ContainerRef;
  const [regions] = byAddress.get("score/regions_1") ?? [];

  it("lets a frame and a box-held card state a whole place, a frame-held card its size", () => {
    expect([holdingOf(ref("group_1")), placeMembersOf(ref("group_1"))]).toEqual([
      "box",
      ITEM_PLACE_MEMBERS,
    ]);
    expect([holdingOf(ref("annotations")), placeMembersOf(ref("annotations"))]).toEqual([
      "box",
      ITEM_PLACE_MEMBERS,
    ]);
    expect([holdingOf(ref("group_1/score")), placeMembersOf(ref("group_1/score"))]).toEqual([
      "frame",
      CARD_PLACE_MEMBERS,
    ]);
    const band = regions as ContainerRef;
    expect([holdingOf(band), placeMembersOf(band)]).toEqual([null, []]);
    expect([holdingOf(box), placeMembersOf(box)]).toEqual([null, []]);
  });

  it("cuts a place to what its container may state", () => {
    const item = { x: 4, width: 120 };
    expect(keptPlace(ref("annotations"), item)).toBe(item);
    expect(keptPlace(ref("group_1/score"), item)).toEqual({ width: 120 });
    expect(keptPlace(ref("group_1/score"), { x: 4, scale: 2 })).toBeUndefined();
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
