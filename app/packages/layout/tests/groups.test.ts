import type { Graphical } from "@timetoalign/timeskeleton";
import { describe, expect, it } from "vitest";
import { DEFAULT_PLACEMENT, draw } from "../src/index.ts";
import { element, loadFile, metrics } from "./support.ts";

const only = (select: object, set: object): Graphical[] => [{ statements: [{ select, set }] }];

describe("the tree of a manifest of one group", () => {
  const manifest = loadFile("groups/group_child_member");

  it("passes the frame's style to its title and members, a member's to its ancestors", () => {
    const drawing = draw(
      manifest,
      DEFAULT_PLACEMENT,
      only({ element: "group" }, { stroke: "#123456", "font-size": 13 }),
      metrics,
    );
    for (const address of [
      "second-half",
      "recording",
      "group_1/name",
      "group_1/second-half/card",
      "group_1/recording/card",
      "piece",
      "piece/name",
    ]) {
      expect(element(drawing, address).style, address).toMatchObject({
        stroke: "#123456",
        "font-size": 13,
      });
    }
  });

  it("passes a member's stroke to its ancestor line only", () => {
    const drawing = draw(
      manifest,
      DEFAULT_PLACEMENT,
      only({ ids: ["second-half"] }, { stroke: "#654321" }),
      metrics,
    );
    expect(element(drawing, "piece").style.stroke).toBe("#654321");
    expect(element(drawing, "recording").style.stroke).toBe("none");
    // The card is the line's sibling under the frame, not its holder.
    expect(element(drawing, "group_1/second-half/card").style.stroke).toBe("none");
  });
});

describe("the tree of a titled manifest of groups and roots", () => {
  const manifest = loadFile("bundles/bundle_mixed");
  const stroke = (layers: Graphical[], address: string) =>
    element(draw(manifest, DEFAULT_PLACEMENT, layers, metrics), address).style.stroke;

  it("passes the block's style to the title, the frames and the ungrouped cards and lines", () => {
    const layers = only({ element: "block" }, { stroke: "#111111" });
    expect(
      ["name", "group_1", "annotations/card", "annotations"].map((at) => stroke(layers, at)),
    ).toEqual(["#111111", "#111111", "#111111", "#111111"]);
  });

  it("never passes a card's style to its line", () => {
    const layers = only({ ids: ["annotations/card"] }, { stroke: "#222222" });
    expect([stroke(layers, "annotations/card"), stroke(layers, "annotations")]).toEqual([
      "#222222",
      "none",
    ]);
  });
});
