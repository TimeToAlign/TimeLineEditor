/**
 * The drawing's own primitives (`docs/drawing.md` in TimeToShare, sections
 * 2.1 to 2.3 and 8.1), for the layout and the writers: the elements a
 * manifest draws, the keys a selector tests, the selector test itself, the
 * timelines drawn as roots, and the named timestamps each card draws with
 * their primary and secondary coordinates.
 */

export type {
  CardStamp,
  CardStamps,
  CardTimeline,
  Domain,
  ElementKey,
  Modality,
  SecondaryStamp,
  StampCoordinate,
  StampSource,
  TimestampLabel,
} from "./manifest/elements.ts";
export {
  BLOCK_KEY,
  bandKey,
  cardStamps,
  DRAWN_FLOW,
  elementKey,
  manifestElements,
  namedTimestamps,
  orderedChildren,
  reachOf,
  selectorMatches,
  TIMESTAMP_LABELS,
  textKey,
  timelineAncestry,
  unownedKey,
} from "./manifest/elements.ts";
export type { Ancestor, AncestorCard, GroupFrame, MemberDrawing } from "./manifest/files.ts";
export { memberDrawings } from "./manifest/files.ts";
