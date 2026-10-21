import type { ElementAddress, OwnerAddress } from "@timetoalign/tilie-core";
import { idAddress, inBlock, partAddress } from "@timetoalign/tilie-core";
import { describe, expect, it } from "vitest";
import { elementsInRect } from "../src/marquee.ts";
import { insideOf, project } from "../src/project.ts";
import { NOTHING_SELECTED } from "../src/selection.ts";
import { A, blockIn, marqueeView, metrics } from "./support.ts";

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
    const card = { x: 56, y: 133.609375, width: 546.484619140625, height: 78.953125 };
    expect(elementsInRect(node, card, every, metrics)).toEqual(
      at(
        idAddress("cmap_1"),
        idAddress("cmap_2"),
        idAddress("jump_from_1"),
        idAddress("score"),
        part("score", "start"),
        part("score", "end"),
        part("score", "name"),
        part("score", "start", "label"),
        part("score", "end", "label"),
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
});
