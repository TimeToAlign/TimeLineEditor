/** Drawings of the fixtures and synthetic drawings for the writers. */

import {
  type Drawing,
  type DrawnElement,
  INITIAL_STYLE,
  type Style,
} from "@timetoalign/tilie-layout";

export { fontDirectory, loadFixture, reviewCases } from "../scripts/review-cases.ts";

export function style(changes: Partial<Style> = {}): Style {
  return { ...INITIAL_STYLE, ...changes };
}

/** A synthetic drawing of `height` 30 and width 60 holding `elements` after its block. */
export function synthetic(...elements: DrawnElement[]): Drawing {
  return {
    width: 60,
    height: 30,
    elements: [
      { type: "block", address: null, style: style(), width: 60, height: 30 },
      ...elements,
    ],
    unmapped: [],
  };
}
