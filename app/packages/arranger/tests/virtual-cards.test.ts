/**
 * Virtual cards are cards (README, "Virtual cards, ribbons, the flow flag
 * and the flow switch"): a press hits one as a card, a move and a resize
 * store what they store for a root's card, and a press on a chunk's label
 * hits that label, a part of the chunk. A double-click on a region a
 * window shows opens the virtual card's editor with the region selected,
 * on a chunk the flow-control editor of its FlowMap's root with the chunk
 * chosen ("Double-click routes").
 */

import type { ElementAddress, PlaceKey, View } from "@timetoalign/tilie-core";
import { cardAddress, idAddress, inBlock, sameAddress } from "@timetoalign/tilie-core";
import type { Drawing } from "@timetoalign/tilie-layout";
import { describe, expect, it } from "vitest";
import { hitOf, keyedBox } from "../src/boxes.ts";
import { editorOf, editorTargetOf, openedFocus } from "../src/editors.ts";
import { itemMoveCommand, itemResizeCommand, itemResizeValues } from "../src/items.ts";
import type { Handle, ResizeMode } from "../src/resize.ts";
import { A, blockIn, changed, metrics, sourceOf, viewOf } from "./support.ts";
import { DEFAULT, drawingIn, ROOT, virtualView } from "./virtualCards.ts";

const VIEW = virtualView();
const DRAWING = drawingIn(VIEW);
const CARD: PlaceKey = { item: DEFAULT };

describe("a virtual card", () => {
  it("is hit as a card by a press on its rectangle", () => {
    const hit = hitOf(A, DRAWING, sourceOf(DRAWING, cardAddress(DEFAULT), "card"));
    expect([hit.kind, hit.address, hit.box?.key]).toEqual([
      "card",
      inBlock(A, cardAddress(DEFAULT)),
      CARD,
    ]);
  });

  it("hits its chunk's label by a press on it", () => {
    const label = { id: DEFAULT, part: [1, "label"] as const };
    const hit = hitOf(A, DRAWING, sourceOf(DRAWING, label));
    expect([hit.kind, hit.address]).toEqual(["element", inBlock(A, label)]);
  });

  it("moves as an item", () => {
    const command = itemMoveCommand(VIEW, A, CARD, 16, 240, metrics);
    expect(command?.changes).toEqual([
      { target: inBlock(A, { id: DEFAULT }), values: { place: { x: 16, y: 240 } } },
      { target: inBlock(A, { id: ROOT }), values: { place: { x: 8, y: 28.8046875 } } },
    ]);
    expect(blockIn(changed(VIEW, command), A).places[DEFAULT]).toEqual({ x: 16, y: 240 });
  });

  it("resizes in every mode as a root's card as wide does", () => {
    const widthOf = (key: PlaceKey) => keyedBox(DRAWING, key)?.item?.place.width;
    expect(widthOf(CARD)).toBe(widthOf({ item: ROOT }));
    const resized = (key: PlaceKey, mode: ResizeMode, handle: Handle) => {
      const box = keyedBox(DRAWING, key);
      if (box === undefined) throw new Error("no card");
      const delta = { dx: 60, dy: 0 };
      const places = itemResizeValues(VIEW, A, box, "arranger", mode, handle, delta, metrics);
      return itemResizeCommand(VIEW, A, places, "arranger", metrics);
    };
    const cases: [ResizeMode, Handle, object | null][] = [
      ["scale", "bottom-right", null],
      ["box", "right", { width: (widthOf(CARD) ?? 0) + 60 }],
      ["stretch", "right", { length: 460 }],
    ];
    for (const [mode, handle, values] of cases) {
      const command = resized(CARD, mode, handle);
      const root = resized({ item: ROOT }, mode, handle)?.changes[0]?.values;
      expect(command?.changes[0]).toEqual({
        target: inBlock(A, { id: DEFAULT }),
        values: values === null ? root : { place: values },
      });
      if (values !== null) expect(root).toEqual({ place: values });
      const place = command?.changes[0]?.values.place;
      expect(blockIn(changed(VIEW, command), A).places[DEFAULT]).toEqual({
        x: 0,
        y: 200,
        ...(typeof place === "object" ? place : {}),
      });
    }
  });
});

/** `virtualView()` with the region `motto` [100, 200] in `allegro` and the sources' regions shown on `allegro_default`. */
function windowed(): View {
  return changed(
    changed(VIEW, {
      type: "add",
      into: inBlock(A, idAddress(ROOT)),
      region: { id: "motto", name: "Motto", start: [100, 1], end: [200, 1] },
    }),
    {
      type: "style",
      select: { facet: "regions", inside: "chunk", within: DEFAULT },
      set: { display: "inline" },
      blocks: [A],
    },
  );
}

/**
 * What a double-click on the first drawing of `address` inside the card
 * under `key` opens: the element hit with a point
 * inside that card, as the canvas reads it.
 */
function opened(view: View, drawing: Drawing, key: PlaceKey, address: ElementAddress) {
  const card = keyedBox(drawing, key);
  if (card === undefined) throw new Error("no card");
  const element = drawing.elements.findIndex(
    (drawn, index) =>
      index >= card.range.start && index < card.range.end && sameAddress(drawn.address, address),
  );
  const drawn = drawing.elements[element];
  if (drawn === undefined) throw new Error(`nothing at ${JSON.stringify(address)} in the card`);
  const source = { element, type: drawn.type, address, role: "primary" as const };
  const hit = hitOf(A, drawing, source, { x: card.x + 1, y: card.y + 1 });
  expect(hit.within?.key).toEqual(key);
  return editorTargetOf(view, hit, null);
}

describe("a double-click", () => {
  const root = inBlock(A, idAddress(ROOT));
  const flowBand = inBlock(A, { id: ROOT, facet: "flow_control" });

  const virtual = inBlock(A, idAddress(DEFAULT));

  it("on a region a window shows opens the virtual card's editor, the region selected", () => {
    const view = windowed();
    const drawing = drawingIn(view);
    expect(opened(view, drawing, CARD, { id: "motto" })).toEqual(virtual);
    expect(opened(view, drawing, CARD, { id: "motto", part: ["label"] })).toEqual(virtual);
    expect(opened(view, drawing, { item: ROOT }, { id: "motto" })).toEqual(root);
    expect(opened(view, drawing, CARD, { id: DEFAULT })).toEqual(virtual);
    expect(editorOf(virtual)).toEqual({ target: virtual });
    const motto = inBlock(A, idAddress("motto"));
    for (const from of [motto, inBlock(A, { id: "motto", part: ["label"] })]) {
      expect(openedFocus(view, { target: virtual }, from)).toEqual({
        kind: "select",
        address: motto,
      });
    }
    expect(openedFocus(view, { target: virtual }, virtual)).toBeNull();
    expect(openedFocus(view, { target: virtual }, inBlock(A, idAddress(ROOT)))).toBeNull();
    expect(openedFocus(view, { target: root }, motto)).toBeNull();
    expect(openedFocus(view, { target: virtual }, null)).toBeNull();
  });

  it("on a chunk opens the flow-control editor of its FlowMap's root, the chunk chosen", () => {
    expect(opened(VIEW, DRAWING, CARD, { id: DEFAULT, part: [1, "label"] })).toEqual(flowBand);
    expect(opened(VIEW, DRAWING, CARD, { id: DEFAULT, part: [1, "start"] })).toEqual(flowBand);
    expect(editorOf(flowBand)).toEqual({ target: root, kind: "flow" });
    const flowMap = blockIn(VIEW, A).manifest.virtual_timelines?.find(
      (item) => item.id === DEFAULT,
    )?.map;
    for (const word of ["label", "start"] as const) {
      expect(
        openedFocus(
          VIEW,
          { target: root, kind: "flow" },
          inBlock(A, { id: DEFAULT, part: [1, word] }),
        ),
      ).toEqual({ kind: "chunk", flowMap, index: 1 });
    }
    expect(
      openedFocus(VIEW, { target: root }, inBlock(A, { id: DEFAULT, part: [1, "label"] })),
    ).toBeNull();
    const switched = viewOf({ id: A, fixture: "flow/switched_card", x: 40, y: 80 });
    expect(
      opened(switched, drawingIn(switched), { item: ROOT }, { id: ROOT, part: [1, "label"] }),
    ).toEqual(flowBand);
  });
});
