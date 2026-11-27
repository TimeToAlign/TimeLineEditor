/**
 * A cut name's flag: its whole text, found through its drawn element, on an
 * opaque box over what lies behind. The expected values are derived in
 * `README.md` ("A cut name's flag").
 */

import { sameAddress } from "@timetoalign/tilie-core";
import {
  DEFAULT_LAYER,
  DEFAULT_PLACEMENT,
  type DrawnElement,
  draw,
  manifestLayer,
  TextMeasure,
} from "@timetoalign/tilie-layout";
import { describe, expect, it } from "vitest";
import { nameFlagOf } from "../src/nameFlag.ts";
import { load, metrics } from "./support.ts";

const manifest = load("flow/virtual_cards");
const drawing = draw(
  manifest,
  { ...DEFAULT_PLACEMENT, places: { allegro_default: {} } },
  [DEFAULT_LAYER, manifestLayer(manifest)],
  metrics,
);
const measure = new TextMeasure(metrics);
const ATTRIBUTES = { x: "16", y: "1", "font-size": "11", fill: "#000000" };

/** The name of the timeline `id` in the drawing. */
function nameOf(id: string): DrawnElement | undefined {
  return drawing.elements.find(
    (element) => element.type === "name" && sameAddress(element.address, { id, part: ["name"] }),
  );
}

describe("a cut name's flag", () => {
  it("shows a virtual card's whole name on a box padded by a quarter of its size", () => {
    const name = nameOf("allegro_default");
    if (name?.type !== "name") throw new Error("allegro_default draws no name");
    expect(name.text).toBe("Allegro, default · unfolded …");
    expect(nameFlagOf(name, ATTRIBUTES, measure)).toEqual({
      text: "Allegro, default · unfolded from Allegro",
      box: {
        x: 13.25,
        y: name.baseline - 10.21044921875 - 2.75,
        width: 220.13427734375,
        height: 18.3046875,
      },
      attributes: ATTRIBUTES,
    });
  });

  it("gives none for a name drawn whole, a label or no element", () => {
    expect(nameFlagOf(nameOf("allegro"), ATTRIBUTES, measure)).toBeNull();
    const label = drawing.elements.find(
      (element) => element.type === "label" && element.address.id === "allegro_default",
    );
    expect(label?.type === "label" && label.text).toBe("A");
    expect(nameFlagOf(label, ATTRIBUTES, measure)).toBeNull();
    expect(nameFlagOf(undefined, ATTRIBUTES, measure)).toBeNull();
  });
});
