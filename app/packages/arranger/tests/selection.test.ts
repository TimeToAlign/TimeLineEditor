import { manifestElements } from "@timetoalign/tilie-core/drawing";
import { describe, expect, it } from "vitest";
import { addressParts } from "../src/editing.ts";
import { blockOf, click, editedSelection, existing } from "../src/selection.ts";
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

describe("click", () => {
  it("selects the element only", () => {
    expect(click(new Set(), `${A}/clt_3`, false)).toEqual(new Set([`${A}/clt_3`]));
  });

  it("replaces the selection without Shift", () => {
    expect(click(new Set([A, B]), C, false)).toEqual(new Set([C]));
  });

  it("toggles with Shift and never mutates its input", () => {
    const start = new Set([A]);
    const added = click(start, `${B}/clt_1`, true);
    expect(added).toEqual(new Set([A, `${B}/clt_1`]));
    expect(click(added, A, true)).toEqual(new Set([`${B}/clt_1`]));
    expect(start).toEqual(new Set([A]));
    expect(added).toEqual(new Set([A, `${B}/clt_1`]));
  });

  it("keeps a card's address: the card and its timeline are two selections", () => {
    const card = click(new Set(), `${A}/recording/card`, false);
    expect(card).toEqual(new Set([`${A}/recording/card`]));
    expect(click(card, `${A}/recording/card`, true)).toEqual(new Set());
    expect(click(new Set([`${A}/recording`]), `${A}/recording/card`, true)).toEqual(
      new Set([`${A}/recording`, `${A}/recording/card`]),
    );
  });

  it("selects addresses the drawings carry", () => {
    for (const [fixture, card, timeline] of [
      ["bare", "bare/card", "bare"],
      [CHILD_MEMBER, "group_1/recording/card", "recording"],
    ] as const) {
      const keys = manifestElements(load(fixture)).map((key) => key.address);
      expect(keys).toContain(card);
      expect(keys).toContain(timeline);
    }
  });
});

describe("addressParts and blockOf", () => {
  it("split an address into its block and its element address, by core's syntax", () => {
    expect(addressParts(A)).toEqual({ block: A, element: null });
    expect(addressParts(`${A}/clt_3`)).toEqual({ block: A, element: "clt_3" });
    expect(addressParts(`${A}/score/region_1/label`)).toEqual({
      block: A,
      element: "score/region_1/label",
    });
    expect(addressParts(`${A}/score/markers_1`)).toEqual({ block: A, element: "score/markers_1" });
  });

  it("give the block of an address", () => {
    expect(blockOf(`${A}/clt_3/name`)).toBe(A);
    expect(blockOf(A)).toBe(A);
    expect(blockOf(`${A}/score/region_1/label`)).toBe(A);
  });

  it("refuse the workspace and a malformed address", () => {
    expect(() => blockOf("workspace")).toThrow(RangeError);
    expect(() => addressParts("workspace")).toThrow(RangeError);
    expect(() => addressParts("not a block/x")).toThrow(RangeError);
  });
});

describe("existing", () => {
  const view = viewOf({ id: A, fixture: "nested" });

  it("drops addresses whose block or element is gone, parts with their element", () => {
    const selection = new Set([
      A,
      `${A}/clt_3`,
      `${A}/clt_3/name`,
      `${A}/clt_9`,
      `${A}/clt_9/name`,
      B,
      `${B}/clt_1`,
    ]);
    expect([...existing(view, selection, null)]).toEqual([A, `${A}/clt_3`, `${A}/clt_3/name`]);
  });

  it("returns the selection itself when everything exists", () => {
    const selection = new Set([A, `${A}/clt_2`]);
    expect(existing(view, selection, null)).toBe(selection);
    const none = new Set<string>();
    expect(existing(view, none, null)).toBe(none);
  });

  it("keeps the title of a named manifest only", () => {
    const title = new Set([`${A}/name`]);
    expect([...existing(viewOf({ id: A, fixture: "bundles/bundle_mixed" }), title, null)]).toEqual([
      `${A}/name`,
    ]);
    expect([...existing(view, title, null)]).toEqual([]);
  });

  it("reads the addresses of a block of several roots with elementOf", () => {
    const selection = new Set([
      `${A}/score/region_1/label`,
      `${A}/score/region_2/label`,
      `${A}/score/name`,
      `${A}/group_1/name`,
      `${A}/page/start`,
      `${A}/nobody/region_1`,
    ]);
    expect([...existing(numbersView(), selection, null)]).toEqual([
      `${A}/score/region_1/label`,
      `${A}/score/name`,
      `${A}/group_1/name`,
      `${A}/page/start`,
    ]);
  });
});

describe("existing when an editor opens", () => {
  it("keeps only what lies inside the opened editor", () => {
    const store = storeOf(
      changed(mixedView(), {
        type: "add",
        into: "workspace",
        block: { id: B, manifest: load("bare"), x: 1000, y: 0 },
      }),
    );
    const open = (target: string) => {
      const refusal = store.open(target);
      if (refusal !== null) throw new Error(refusal.message);
    };
    const opening = (target: string, ...addresses: string[]) => {
      open(target);
      return [...existing(store.view, new Set(addresses), store.editing.at(-1) ?? null)];
    };
    expect(opening(A, A, B, `${A}/group_1`, `${A}/annotations/card`)).toEqual([
      A,
      `${A}/group_1`,
      `${A}/annotations/card`,
    ]);
    store.done();
    expect(
      opening(
        `${A}/group_1`,
        A,
        `${A}/group_1`,
        `${A}/group_1/score/card`,
        `${A}/performance`,
        `${A}/group_2/page/card`,
      ),
    ).toEqual([`${A}/group_1`, `${A}/group_1/score/card`, `${A}/performance`]);
    expect(
      opening(`${A}/score`, `${A}/group_1/score/card`, `${A}/score/start`, `${A}/performance`),
    ).toEqual([`${A}/group_1/score/card`, `${A}/score/start`]);
    store.done();
    store.done();
    expect(opening(`${A}/score`, `${A}/score`, `${A}/score/name`)).toEqual([
      `${A}/score`,
      `${A}/score/name`,
    ]);
    store.done();
    open(`${A}/group_1`);
    expect(
      opening(
        `${A}/score`,
        `${A}/score/conversion_maps_1`,
        `${A}/performance/conversion_maps_1`,
        `${A}/score/start`,
      ),
    ).toEqual([`${A}/score/conversion_maps_1`, `${A}/score/start`]);
  });
});

describe("editedSelection", () => {
  it("selects the edited element by the address a click on its box selects", () => {
    const view = mixedView();
    const nested = viewOf({ id: A, fixture: "nested" });
    expect(editedSelection(view, { target: A, kind: "bundle" })).toEqual(new Set([A]));
    expect(editedSelection(view, { target: `${A}/group_1`, kind: "group" })).toEqual(
      new Set([`${A}/group_1`]),
    );
    expect(editedSelection(view, { target: `${A}/score`, kind: "timeline" })).toEqual(
      new Set([`${A}/group_1/score/card`]),
    );
    expect(editedSelection(nested, { target: `${A}/clt_3`, kind: "timeline" })).toEqual(
      new Set([`${A}/clt_3`]),
    );
    expect(editedSelection(nested, { target: `${A}/clt_1`, kind: "timeline" })).toEqual(
      new Set([`${A}/clt_1/card`]),
    );
  });
});
