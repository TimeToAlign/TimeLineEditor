/**
 * Virtual cards are cards (README, "Virtual cards, ribbons, the flow flag
 * and the flow switch"): a press hits one as a card, a move and a resize
 * store what they store for a root's card, and a press on a chunk's brace
 * hits the chunk.
 */

import type { PlaceKey } from "@timetoalign/tilie-core";
import { cardAddress, inBlock } from "@timetoalign/tilie-core";
import { describe, expect, it } from "vitest";
import { hitOf, keyedBox } from "../src/boxes.ts";
import { itemMoveCommand, itemResizeCommand, itemResizeValues } from "../src/items.ts";
import type { Handle, ResizeMode } from "../src/resize.ts";
import { A, blockIn, changed, metrics, sourceOf } from "./support.ts";
import { brace, DEFAULT, drawingIn, ROOT, virtualView } from "./virtualCards.ts";

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

  it("hits its chunk by a press on a brace", () => {
    const hit = hitOf(A, DRAWING, sourceOf(DRAWING, brace(DEFAULT, 1)));
    expect([hit.kind, hit.address]).toEqual(["element", inBlock(A, brace(DEFAULT, 1))]);
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
