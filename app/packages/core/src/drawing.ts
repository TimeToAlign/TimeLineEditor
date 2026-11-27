/**
 * The drawing's own primitives (`docs/drawing.md` in TimeToShare, sections
 * 2.1 to 2.3 and 8.1), for the layout and the writers: the elements a
 * manifest draws, the keys a selector tests, the selector test itself, the
 * timelines drawn as roots, the named timestamps each card draws with
 * their primary and secondary coordinates, the stored elisions of each
 * timeline with the words of their labels, the arrangement of a bundle's
 * items side by side, the virtual timelines drawn as roots, and how a
 * switched card is unfolded onto its FlowMap.
 */

export type { Anchor, ArrangementConflict, Row } from "./manifest/arrangement.ts";
export {
  anchorChange,
  anchorsOf,
  isArrangementConflict,
  itemOrder,
  rowOf,
} from "./manifest/arrangement.ts";
export type {
  CardStamp,
  CardStamps,
  CardTimeline,
  Domain,
  ElementKey,
  Modality,
  PlacedFlow,
  SecondaryStamp,
  StampCoordinate,
  StampSource,
  TimestampLabel,
} from "./manifest/elements.ts";
export {
  BLOCK_KEY,
  bandKey,
  cardStamps,
  elementKey,
  leaderKey,
  manifestElements,
  memberFlow,
  namedTimestamps,
  orderedChildren,
  reachOf,
  regionClasses,
  selectorMatches,
  TIMESTAMP_LABELS,
  textKey,
  unownedKey,
} from "./manifest/elements.ts";
export type { ElisionLabel } from "./manifest/elisions.ts";
export {
  ELISION_LABELS,
  elisionsOn,
  elisionsUnder,
  groupElisions,
} from "./manifest/elisions.ts";
export type { Ancestor, AncestorCard, GroupFrame, MemberDrawing, Named } from "./manifest/files.ts";
export {
  compareByName,
  memberDrawings,
  ungroupedVirtuals,
  virtualDrawing,
  withVirtualMembers,
} from "./manifest/files.ts";
export { flowSymbols, passesText } from "./manifest/flow.ts";
export type { Piece, PlayedSpan, Switch, Unfolding } from "./manifest/switched.ts";
export { playedAt, playedSpan, switchOf, unfoldingOf } from "./manifest/switched.ts";
export { timelineAncestry } from "./manifest/tree.ts";
