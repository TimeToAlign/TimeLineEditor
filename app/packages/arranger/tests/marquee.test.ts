import type { ElementAddress, OwnerAddress, PlaceKey, View } from "@timetoalign/tilie-core";
import { idAddress, inBlock, partAddress, samePlaceKey } from "@timetoalign/tilie-core";
import { INITIAL_STYLE, TextMeasure } from "@timetoalign/tilie-layout";
import { describe, expect, it } from "vitest";
import type { Editing } from "../src/editing.ts";
import { elementBounds, elementsInRect, type Rect, rectOnCanvas } from "../src/marquee.ts";
import type { BlockNode } from "../src/node.ts";
import { insideOf, project } from "../src/project.ts";
import { NOTHING_SELECTED } from "../src/selection.ts";
import { A, blockIn, changed, marqueeView, metrics, viewOf } from "./support.ts";

// Drawn with the defaults: `recording`'s ancestor card lies behind `group_2`'s frame.
const view = marqueeView();
const nodeOf = (shown: View, editing: Editing | null): BlockNode => {
  const [found] = project(shown, NOTHING_SELECTED, [], metrics, editing);
  if (found === undefined) throw new Error("no node");
  return found;
};
const node = nodeOf(view, null);
const { manifest } = blockIn(view, A);
const every = insideOf(manifest, node.data.drawing, null);
const at = (...elements: ElementAddress[]) => elements.map((element) => inBlock(A, element));
const part = (id: string, ...words: ("start" | "end" | "name" | "label")[]): ElementAddress =>
  words.reduce<OwnerAddress>((owner, word) => partAddress(owner, word), idAddress(id));
const bottom = { x: 40, y: 410, width: 600, height: 86.25 };
/** `recording`'s timeline editor: the one editor raising its ancestor card. */
const RECORDING: Editing = { target: inBlock(A, idAddress("recording")), kind: "timeline" };
/** The canvas rectangle of the box under `key` in `node`'s drawing, `by` larger on every side. */
const around = (shown: BlockNode, key: PlaceKey, by = 2): Rect => {
  const box = shown.data.drawing.boxes.find(
    (found) => found.key !== null && samePlaceKey(found.key, key),
  );
  if (box === undefined) throw new Error(`no box ${JSON.stringify(key)}`);
  const { x, y, width, height } = rectOnCanvas(shown, box);
  return { x: x - by, y: y - by, width: width + 2 * by, height: height + 2 * by };
};
const ANCESTOR_CARD: PlaceKey = { item: "group_2", member: "recording" };

describe("elementsInRect", () => {
  it("selects the elements wholly inside, never a box", () => {
    const card = { x: 56, y: 133.609375, width: 547.9150390625, height: 78.953125 };
    expect(elementsInRect(node, card, every, metrics)).toEqual(
      at(
        idAddress("cmap_1"),
        idAddress("cmap_2"),
        idAddress("jump_from_1"),
        idAddress("score"),
        idAddress("timestamp_9"),
        idAddress("timestamp_10"),
        part("score", "name"),
        part("jump_from_1", "label"),
      ),
    );
  });

  it("takes an address drawn twice only when both drawings lie inside", () => {
    expect(elementsInRect(node, bottom, every, metrics)).toEqual(
      at(
        idAddress("cmap_6"),
        idAddress("cmap_7"),
        idAddress("region_3"),
        idAddress("excerpt"),
        idAddress("dlt_1"),
        idAddress("timestamp_3"),
        idAddress("timestamp_4"),
        part("dlt_1", "name"),
        part("excerpt", "name"),
        part("region_3", "label"),
      ),
    );
  });

  it("selects only inside the edited element", () => {
    const child = insideOf(manifest, node.data.drawing, "dlt_1");
    expect(elementsInRect(node, bottom, child, metrics)).toEqual(
      at(idAddress("cmap_7"), idAddress("dlt_1"), part("dlt_1", "name")),
    );
    const group = insideOf(manifest, node.data.drawing, "group_1");
    expect(elementsInRect(node, bottom, group, metrics)).toEqual([]);
  });

  it("takes a member card's elements by their drawings outside the ancestor card", () => {
    expect(
      elementsInRect(node, around(node, { item: "group_2", member: "excerpt" }), every, metrics),
    ).toEqual(
      at(
        idAddress("cmap_6"),
        idAddress("cmap_7"),
        idAddress("region_3"),
        idAddress("recording"),
        idAddress("excerpt"),
        idAddress("dlt_1"),
        part("excerpt", "start"),
        part("excerpt", "end"),
        idAddress("timestamp_3"),
        idAddress("timestamp_4"),
        part("recording", "name"),
        part("dlt_1", "name"),
        part("excerpt", "name"),
        part("excerpt", "start", "label"),
        part("excerpt", "end", "label"),
        part("region_3", "label"),
      ),
    );
    expect(elementsInRect(node, around(node, { item: "group_2" }), every, metrics)).toEqual(
      at(
        part("group_2", "name"),
        idAddress("cmap_4"),
        idAddress("page"),
        idAddress("timestamp_5"),
        idAddress("timestamp_6"),
        part("page", "name"),
        idAddress("cmap_6"),
        idAddress("cmap_7"),
        idAddress("region_3"),
        idAddress("recording"),
        idAddress("excerpt"),
        idAddress("dlt_1"),
        part("excerpt", "start"),
        part("excerpt", "end"),
        idAddress("timestamp_3"),
        idAddress("timestamp_4"),
        part("recording", "name"),
        part("dlt_1", "name"),
        part("excerpt", "name"),
        part("excerpt", "start", "label"),
        part("excerpt", "end", "label"),
        part("region_3", "label"),
      ),
    );
  });

  it("counts an ancestor card's drawings only while the card is raised", () => {
    const card = around(node, ANCESTOR_CARD);
    const frame = around(node, { item: "group_2" }, 0);
    const strip = { ...card, width: frame.x - 2 - card.x };
    expect(elementsInRect(node, strip, every, metrics)).toEqual([]);
    const behind = [
      idAddress("cmap_7"),
      idAddress("recording"),
      part("excerpt", "start"),
      part("excerpt", "end"),
      part("recording", "name"),
      part("excerpt", "start", "label"),
      part("excerpt", "end", "label"),
    ];
    expect(elementsInRect(node, card, every, metrics)).toEqual(at(...behind));
    const raised = nodeOf(view, RECORDING);
    const { inside } = raised.data;
    expect(elementsInRect(raised, strip, inside, metrics)).toEqual([]);
    expect(elementsInRect(raised, card, inside, metrics)).toEqual(
      at(
        idAddress("cmap_5"),
        idAddress("cmap_7"),
        idAddress("recording"),
        part("recording", "name"),
        part("excerpt", "start"),
        part("excerpt", "end"),
        part("excerpt", "start", "label"),
        part("excerpt", "end", "label"),
      ),
    );
  });

  it("takes the affordance on an ancestor card's line only while the card is raised", () => {
    const marked = changed(view, {
      type: "add",
      into: inBlock(A, idAddress("recording")),
      timestamp: { name: "Mark", coordinate: 22050, display: [] },
    });
    const stamps = (shown: BlockNode) => {
      const { width, height } = shown.data.drawing;
      return elementsInRect(shown, { ...shown.position, width, height }, shown.data.inside, metrics)
        .flatMap(({ id }) => (id?.startsWith("timestamp_") ? [id] : []))
        .sort();
    };
    expect(stamps(nodeOf(marked, null))).toEqual(
      [1, 10, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `timestamp_${n}`),
    );
    expect(stamps(nodeOf(marked, RECORDING))).toEqual([
      "timestamp_11",
      "timestamp_3",
      "timestamp_4",
    ]);
  });

  it("takes a named timestamp for its parts, and one that draws nothing by its wedge", () => {
    const silent = changed(viewOf({ id: A, fixture: "timestamps" }), {
      type: "set",
      changes: [{ target: inBlock(A, idAddress("timestamp_2")), values: { display: [] } }],
    });
    const [shown] = project(silent, NOTHING_SELECTED, [], metrics, null);
    if (shown === undefined) throw new Error("no node");
    const { drawing } = shown.data;
    const inside = insideOf(blockIn(silent, A).manifest, drawing, null);
    const stamps = (width: number) =>
      elementsInRect(shown, { ...shown.position, width, height: drawing.height }, inside, metrics)
        .flatMap(({ id, part: words }) =>
          id?.startsWith("timestamp_") ? [words === undefined ? id : `${id} ${words}`] : [],
        )
        .sort();
    expect(stamps(drawing.width)).toEqual(["timestamp_1", "timestamp_2", "timestamp_3"]);
    expect(stamps(340)).toEqual(["timestamp_1", "timestamp_3"]);
  });
});

describe("elementBounds", () => {
  it("spans an alignment anchor's line between its two end points, whichever comes first", () => {
    const measure = new TextMeasure(metrics);
    const address = idAddress("anchor_1");
    const line = { type: "alignment_anchor" as const, address, style: INITIAL_STYLE };
    expect(elementBounds({ ...line, x1: 120, y1: 80, x2: 40, y2: 30 }, measure)).toEqual({
      x: 40,
      y: 30,
      width: 80,
      height: 50,
    });
    expect(elementBounds({ ...line, x1: 40, y1: 64.5, x2: 300, y2: 64.5 }, measure)).toEqual({
      x: 40,
      y: 64.5,
      width: 260,
      height: 0,
    });
  });

  it("spans a wedge's tip and its base's corners, as it is turned", () => {
    const measure = new TextMeasure(metrics);
    const tip = {
      type: "wedge" as const,
      address: idAddress("w"),
      style: INITIAL_STYLE,
      x: 10,
      yt: 5,
    };
    const bounds = (corners: readonly [{ dx: number; y: number }, { dx: number; y: number }]) =>
      elementBounds({ ...tip, corners }, measure);
    expect(
      bounds([
        { dx: -3, y: 18 },
        { dx: 3, y: 18 },
      ]),
    ).toEqual({ x: 7, y: 5, width: 6, height: 13 });
    expect(
      bounds([
        { dx: 13, y: 8 },
        { dx: 13, y: 2 },
      ]),
    ).toEqual({ x: 10, y: 2, width: 13, height: 6 });
    expect(
      bounds([
        { dx: -11.3136, y: 5 + -2.8284 },
        { dx: -7.071, y: 5 + -7.071 },
      ]),
    ).toEqual({
      x: 10 + -11.3136,
      y: 5 + -7.071,
      width: 10 - (10 + -11.3136),
      height: 5 - (5 + -7.071),
    });
  });
});
