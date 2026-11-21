import type { ElementAddress, OwnerAddress } from "@timetoalign/tilie-core";
import { idAddress, inBlock, partAddress } from "@timetoalign/tilie-core";
import { INITIAL_STYLE, TextMeasure } from "@timetoalign/tilie-layout";
import { describe, expect, it } from "vitest";
import { elementBounds, elementsInRect } from "../src/marquee.ts";
import { insideOf, project } from "../src/project.ts";
import { NOTHING_SELECTED } from "../src/selection.ts";
import { A, blockIn, changed, marqueeView, metrics, viewOf } from "./support.ts";

const view = marqueeView();
const [node] = project(view, NOTHING_SELECTED, [], metrics, null);
if (node === undefined) throw new Error("no node");
const { manifest } = blockIn(view, A);
const every = insideOf(manifest, node.data.drawing, null);
const at = (...elements: ElementAddress[]) => elements.map((element) => inBlock(A, element));
const part = (id: string, ...words: ("start" | "end" | "name" | "label")[]): ElementAddress =>
  words.reduce<OwnerAddress>((owner, word) => partAddress(owner, word), idAddress(id));
const bottom = { x: 40, y: 410, width: 600, height: 86.25 };

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
});
