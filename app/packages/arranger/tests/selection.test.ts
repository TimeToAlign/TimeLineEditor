import type { Address, ElementAddress, Part } from "@timetoalign/tilie-core";
import {
  addressKey,
  bandAddress,
  cardAddress,
  idAddress,
  inBlock,
  TITLE_ADDRESS,
  WORKSPACE,
} from "@timetoalign/tilie-core";
import { manifestElements } from "@timetoalign/tilie-core/drawing";
import { describe, expect, it } from "vitest";
import { addressParts } from "../src/editing.ts";
import {
  blockOf,
  click,
  editedSelection,
  existing,
  isSelected,
  NOTHING_SELECTED,
  selectionOf,
} from "../src/selection.ts";
import {
  A,
  B,
  C,
  CHILD_MEMBER,
  changed,
  load,
  mixedView,
  numbersView,
  storeOf,
  viewOf,
} from "./support.ts";

/** The element address of `id` with the part words `words`. */
function part(id: string, ...words: Part[]): ElementAddress {
  return { id, part: words };
}

/** The address of `element` in block A. */
function inA(element: ElementAddress): Address {
  return inBlock(A, element);
}

/** The keys of a selection's addresses, in its order. */
function keysOf(selection: ReadonlyMap<string, Address>): string[] {
  return [...selection.keys()];
}

/** The keys of `addresses`, in their order. */
function keys(...addresses: Address[]): string[] {
  return addresses.map(addressKey);
}

describe("selectionOf and isSelected", () => {
  it("hold each address once, by its key, however its object was built", () => {
    const selection = selectionOf([inA(part("clt_3", "name")), { id: "clt_3", block: A }]);
    expect(keysOf(selection)).toEqual(keys(inA(part("clt_3", "name")), inA(idAddress("clt_3"))));
    expect(isSelected(selection, { part: ["name"], id: "clt_3", block: A })).toBe(true);
    expect(isSelected(selection, { block: A })).toBe(false);
    expect(selectionOf([{ block: A }, { block: A }]).size).toBe(1);
    expect(NOTHING_SELECTED.size).toBe(0);
  });
});

describe("click", () => {
  it("selects the element only", () => {
    expect(keysOf(click(NOTHING_SELECTED, inA(idAddress("clt_3")), false))).toEqual(
      keys(inA(idAddress("clt_3"))),
    );
  });

  it("replaces the selection without Shift", () => {
    const selection = selectionOf([{ block: A }, { block: B }]);
    expect(keysOf(click(selection, { block: C }, false))).toEqual(keys({ block: C }));
  });

  it("toggles with Shift and never mutates its input", () => {
    const start = selectionOf([{ block: A }]);
    const added = click(start, inBlock(B, idAddress("clt_1")), true);
    expect(keysOf(added)).toEqual(keys({ block: A }, inBlock(B, idAddress("clt_1"))));
    expect(keysOf(click(added, { block: A }, true))).toEqual(keys(inBlock(B, idAddress("clt_1"))));
    expect(keysOf(click(added, { id: "clt_1", block: B }, true))).toEqual(keys({ block: A }));
    expect(keysOf(start)).toEqual(keys({ block: A }));
    expect(keysOf(added)).toEqual(keys({ block: A }, inBlock(B, idAddress("clt_1"))));
  });

  it("keeps a card's address: the card and its timeline are two selections", () => {
    const address = inA(cardAddress("recording"));
    const card = click(NOTHING_SELECTED, address, false);
    expect(keysOf(card)).toEqual(keys(address));
    expect(click(card, inA(cardAddress("recording")), true).size).toBe(0);
    const timeline = selectionOf([inA(idAddress("recording"))]);
    expect(keysOf(click(timeline, address, true))).toEqual(
      keys(inA(idAddress("recording")), address),
    );
  });

  it("selects addresses the drawings carry", () => {
    for (const [fixture, timeline] of [
      ["bare", "bare"],
      [CHILD_MEMBER, "recording"],
    ] as const) {
      const listed = manifestElements(load(fixture)).map((key) => addressKey(key.address));
      expect(listed).toContain(addressKey(cardAddress(timeline)));
      expect(listed).toContain(addressKey(idAddress(timeline)));
    }
  });
});

describe("addressParts and blockOf", () => {
  it("read an address as its block and its element address", () => {
    expect(addressParts({ block: A })).toEqual({ block: A, element: null });
    expect(addressParts(inA(idAddress("clt_3")))).toEqual({ block: A, element: { id: "clt_3" } });
    expect(addressParts(inA(part("region_1", "label")))).toEqual({
      block: A,
      element: { id: "region_1", part: ["label"] },
    });
    expect(addressParts(inA(bandAddress("score", "markers")))).toEqual({
      block: A,
      element: { id: "score", facet: "markers" },
    });
    expect(addressParts(inA(TITLE_ADDRESS))).toEqual({ block: A, element: { part: ["name"] } });
  });

  it("give the block of an address", () => {
    expect(blockOf(inA(part("clt_3", "name")))).toBe(A);
    expect(blockOf({ block: A })).toBe(A);
    expect(blockOf(inA(part("region_1", "label")))).toBe(A);
  });

  it("refuse the workspace, which names no block", () => {
    expect(() => blockOf(WORKSPACE)).toThrow(RangeError);
    expect(() => addressParts(WORKSPACE)).toThrow(RangeError);
  });
});

describe("existing", () => {
  const view = viewOf({ id: A, fixture: "nested" });

  it("drops addresses whose block or element is gone, parts with their element", () => {
    const selection = selectionOf([
      { block: A },
      inA(idAddress("clt_3")),
      inA(part("clt_3", "name")),
      inA(idAddress("clt_9")),
      inA(part("clt_9", "name")),
      { block: B },
      inBlock(B, idAddress("clt_1")),
    ]);
    expect(keysOf(existing(view, selection, null))).toEqual(
      keys({ block: A }, inA(idAddress("clt_3")), inA(part("clt_3", "name"))),
    );
  });

  it("returns the selection itself when everything exists", () => {
    const selection = selectionOf([{ block: A }, inA(idAddress("clt_2"))]);
    expect(existing(view, selection, null)).toBe(selection);
    expect(existing(view, NOTHING_SELECTED, null)).toBe(NOTHING_SELECTED);
  });

  it("keeps the title of a named manifest only", () => {
    const title = selectionOf([inA(TITLE_ADDRESS)]);
    const mixed = viewOf({ id: A, fixture: "bundles/bundle_mixed" });
    expect(keysOf(existing(mixed, title, null))).toEqual(keys(inA(TITLE_ADDRESS)));
    expect(existing(view, title, null).size).toBe(0);
  });

  it("reads the addresses of a block of several roots through core's resolver", () => {
    const selection = selectionOf([
      inA(part("region_1", "label")),
      inA(part("region_2", "label")),
      inA(part("score", "name")),
      inA(part("group_1", "name")),
      inA(part("page", "start")),
      inA(idAddress("nobody")),
    ]);
    expect(keysOf(existing(numbersView(), selection, null))).toEqual(
      keys(
        inA(part("region_1", "label")),
        inA(part("score", "name")),
        inA(part("group_1", "name")),
        inA(part("page", "start")),
      ),
    );
  });
});

describe("existing when an editor opens", () => {
  it("keeps only what lies inside the opened editor", () => {
    const store = storeOf(
      changed(mixedView(), {
        type: "add",
        into: WORKSPACE,
        block: { id: B, manifest: load("bare"), x: 1000, y: 0 },
      }),
    );
    const open = (target: Address) => {
      const refusal = store.open(target);
      if (refusal !== null) throw new Error(refusal.message);
    };
    const opening = (target: Address, ...addresses: Address[]) => {
      open(target);
      return keysOf(existing(store.view, selectionOf(addresses), store.editing.at(-1) ?? null));
    };
    const group = inA(idAddress("group_1"));
    const score = inA(idAddress("score"));
    const scoreCard = inA(cardAddress("score"));
    const scoreStart = inA(part("score", "start"));
    const performance = inA(idAddress("performance"));
    const annotationsCard = inA(cardAddress("annotations"));
    expect(opening({ block: A }, { block: A }, { block: B }, group, annotationsCard)).toEqual(
      keys({ block: A }, group, annotationsCard),
    );
    store.done();
    expect(
      opening(group, { block: A }, group, scoreCard, performance, inA(cardAddress("page"))),
    ).toEqual(keys(group, scoreCard, performance));
    expect(opening(score, scoreCard, scoreStart, performance)).toEqual(keys(scoreCard, scoreStart));
    store.done();
    store.done();
    expect(opening(score, score, inA(part("score", "name")))).toEqual(
      keys(score, inA(part("score", "name"))),
    );
    store.done();
    open(group);
    const scoreBand = inA(bandAddress("score", "conversion_maps"));
    expect(
      opening(score, scoreBand, inA(bandAddress("performance", "conversion_maps")), scoreStart),
    ).toEqual(keys(scoreBand, scoreStart));
  });
});

describe("editedSelection", () => {
  it("selects the edited element by the address a click on its box selects", () => {
    const view = mixedView();
    const nested = viewOf({ id: A, fixture: "nested" });
    const shared = viewOf({ id: A, fixture: "bundles/bundle_shared_member" });
    expect(keysOf(editedSelection(view, { target: { block: A }, kind: "bundle" }))).toEqual(
      keys({ block: A }),
    );
    const group = inA(idAddress("group_1"));
    expect(keysOf(editedSelection(view, { target: group, kind: "group" }))).toEqual(keys(group));
    expect(
      keysOf(editedSelection(view, { target: inA(idAddress("score")), kind: "timeline" })),
    ).toEqual(keys(inA(cardAddress("score"))));
    expect(
      keysOf(editedSelection(nested, { target: inA(idAddress("clt_3")), kind: "timeline" })),
    ).toEqual(keys(inA(idAddress("clt_3"))));
    expect(
      keysOf(editedSelection(nested, { target: inA(idAddress("clt_1")), kind: "timeline" })),
    ).toEqual(keys(inA(cardAddress("clt_1"))));
    expect(
      keysOf(editedSelection(shared, { target: inA(idAddress("t")), kind: "timeline" })),
    ).toEqual(keys(inA(cardAddress("t"))));
  });
});
