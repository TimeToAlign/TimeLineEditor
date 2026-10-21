/**
 * The drawing's own primitives (`docs/drawing.md` in TimeToShare, sections
 * 2.1 to 2.3 and 8.1), for the layout and the writers: the elements a
 * manifest draws, the keys a selector tests, the selector test itself, and
 * the timelines drawn as roots.
 */

export type { Domain, ElementKey, Modality } from "./manifest/elements.ts";
export {
  BOX_KEY,
  bandKey,
  DRAWN_FLOW,
  elementKey,
  manifestElements,
  orderedChildren,
  selectorMatches,
  textKey,
  timelineAncestry,
  unownedKey,
} from "./manifest/elements.ts";
export type { Ancestor, MemberDrawing } from "./manifest/files.ts";
export { memberDrawings } from "./manifest/files.ts";
