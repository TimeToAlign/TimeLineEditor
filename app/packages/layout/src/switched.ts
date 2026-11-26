/**
 * Switched cards (`docs/drawing.md` in TimeToShare, section 8.10): the root
 * a switched card's traversal starts from. Which card is switched, its
 * stretch pieces and where a position or an extent is played in each are
 * core's (`switchOf`, `unfoldingOf`, `playedAt`, `playedSpan`).
 */

import type { TimelineManifest } from "@timetoalign/tilie-core";

/**
 * The timeline a switched card draws as its root (section 8.10): `T` holding
 * nothing, since every element of its tree is drawn in the pieces, named
 * `name` where it is given (`T`'s own card: `T`'s name, ` · ` and what
 * `flow` names), locked, so that the line of the card switched to the
 * FlowMap ends in an end circle.
 */
export function unfoldedRoot(timeline: TimelineManifest, name: string | null): TimelineManifest {
  return {
    ...timeline,
    ...(name === null ? {} : { name, locked: true }),
    is_segment_line: false,
    children: [],
    conversion_maps: [],
    regions: [],
    flow_control: [],
  };
}
