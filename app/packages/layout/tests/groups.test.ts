import { type ElementAddress, TITLE_ADDRESS } from "@timetoalign/tilie-core";
import type { Graphical } from "@timetoalign/timetoshare";
import { describe, expect, it } from "vitest";
import { DEFAULT_PLACEMENT, draw } from "../src/index.ts";
import { at, element, loadFile, metrics } from "./support.ts";

const only = (select: object, set: object): Graphical[] => [{ statements: [{ select, set }] }];

describe("the tree of a manifest of one group", () => {
  const manifest = loadFile("groups/group_child_member");

  it("passes the frame's style to its title and members, a member's to its ancestors", () => {
    const drawing = draw(
      manifest,
      DEFAULT_PLACEMENT,
      only({ element: "frame" }, { stroke: "#123456", "font-size": 13 }),
      metrics,
    );
    for (const address of [
      at("second-half"),
      at("recording"),
      at("group_1", "name"),
      at("second-half", "card"),
      at("recording", "card"),
      at("piece"),
      at("piece", "name"),
    ]) {
      expect(element(drawing, address).style, JSON.stringify(address)).toMatchObject({
        stroke: "#123456",
        "font-size": 13,
      });
    }
  });

  it("passes a member's stroke to its ancestor line only", () => {
    const drawing = draw(
      manifest,
      DEFAULT_PLACEMENT,
      only({ addresses: [at("second-half")] }, { stroke: "#654321" }),
      metrics,
    );
    expect(element(drawing, at("piece")).style.stroke).toBe("#654321");
    expect(element(drawing, at("recording")).style.stroke).toBe("none");
    // The card is the line's sibling under the frame, not its holder.
    expect(element(drawing, at("second-half", "card")).style.stroke).toBe("none");
  });
});

describe("the tree of a titled manifest of groups and roots", () => {
  const manifest = loadFile("bundles/bundle_mixed");
  const stroke = (layers: Graphical[], address: ElementAddress) =>
    element(draw(manifest, DEFAULT_PLACEMENT, layers, metrics), address).style.stroke;

  it("passes the block's style to the title, the frames and the ungrouped cards and lines", () => {
    const layers = only({ element: "block" }, { stroke: "#111111" });
    expect(
      [TITLE_ADDRESS, at("group_1"), at("annotations", "card"), at("annotations")].map((address) =>
        stroke(layers, address),
      ),
    ).toEqual(["#111111", "#111111", "#111111", "#111111"]);
  });

  it("never passes a card's style to its line", () => {
    const layers = only({ addresses: [at("annotations", "card")] }, { stroke: "#222222" });
    expect([stroke(layers, at("annotations", "card")), stroke(layers, at("annotations"))]).toEqual([
      "#222222",
      "none",
    ]);
  });
});
