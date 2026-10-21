import { describe, expect, it } from "vitest";
import { elementsInRect } from "../src/marquee.ts";
import { insideOf, project } from "../src/project.ts";
import { A, blockIn, marqueeView, metrics } from "./support.ts";

const view = marqueeView();
const [node] = project(view, new Set(), [], metrics, null);
if (node === undefined) throw new Error("no node");
const { manifest } = blockIn(view, A);
const every = insideOf(manifest, node.data.drawing, null);
const at = (...elements: string[]) => elements.map((element) => `${A}/${element}`);
const bottom = { x: 40, y: 410, width: 600, height: 86.25 };

describe("elementsInRect", () => {
  it("selects the elements wholly inside, never a box", () => {
    const card = { x: 56, y: 133.609375, width: 546.484619140625, height: 78.953125 };
    expect(elementsInRect(node, card, every, metrics)).toEqual(
      at(
        "score/cmap_1",
        "score/cmap_2",
        "score/jump_from_1",
        "score",
        "score/start",
        "score/end",
        "score/name",
        "score/start/label",
        "score/end/label",
        "score/jump_from_1/label",
      ),
    );
  });

  it("takes an address drawn twice only when both drawings lie inside", () => {
    expect(elementsInRect(node, bottom, every, metrics)).toEqual(
      at(
        "recording/cmap_2",
        "recording/cmap_3",
        "recording/region_1",
        "excerpt",
        "dlt_1",
        "dlt_1/name",
        "excerpt/name",
        "recording/region_1/label",
      ),
    );
  });

  it("selects only inside the edited element", () => {
    const child = insideOf(manifest, node.data.drawing, "dlt_1");
    expect(elementsInRect(node, bottom, child, metrics)).toEqual(
      at("recording/cmap_3", "dlt_1", "dlt_1/name"),
    );
    const group = insideOf(manifest, node.data.drawing, "group_1");
    expect(elementsInRect(node, bottom, group, metrics)).toEqual([]);
  });
});
