import { describe, expect, it } from "vitest";
import { elementsInRect, insideOf, project } from "../src/index.ts";
import { A, blockIn, changed, metrics, mixedView } from "./support.ts";

/** `mixed` with the region `region_1` (0 to 10 samples) added to `dlt_1`. */
const view = changed(mixedView(), {
  type: "add",
  into: `${A}/dlt_1`,
  region: { id: "region_1", name: "A", start: 0, end: 10 },
});
const [node] = project(view, new Set(), [], metrics, null);
if (node === undefined) throw new Error("no node");
const { manifest } = blockIn(view, A);
const every = insideOf(manifest, node.data.drawing, null);
const at = (...elements: string[]) => elements.map((element) => `${A}/${element}`);
const bottom = { x: 40, y: 380, width: 600, height: 82.98046875 };

describe("elementsInRect", () => {
  it("selects the elements wholly inside, never a box", () => {
    const card = { x: 56, y: 133.609375, width: 546.484619140625, height: 49.37890625 };
    expect(elementsInRect(node, card, every, metrics)).toEqual(
      at("score", "score/start", "score/end", "score/name", "score/start/label", "score/end/label"),
    );
  });

  it("takes an address drawn twice only when both drawings lie inside", () => {
    expect(elementsInRect(node, bottom, every, metrics)).toEqual(
      at(
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
      at("recording/region_1", "dlt_1", "dlt_1/name", "recording/region_1/label"),
    );
    const group = insideOf(manifest, node.data.drawing, "group_1");
    expect(elementsInRect(node, bottom, group, metrics)).toEqual([]);
  });
});
