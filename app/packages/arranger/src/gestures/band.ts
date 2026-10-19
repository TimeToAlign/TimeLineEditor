/** Moving a band of the edited timeline across its bands and its line, in its timeline editor. */

import type { View } from "@timetoalign/tilie-core";
import { bandOrderOf, qualify } from "@timetoalign/tilie-core";
import type { Drawing } from "@timetoalign/tilie-layout";
import { bandDrop, bandMoveCommand } from "../bands.ts";
import type { BandBox } from "../boxes.ts";
import { hitOf, isBand } from "../boxes.ts";
import type { GestureStrategy } from "../gesture.ts";
import { sourceAt } from "../gesture.ts";
import { sameSequence } from "../numbers.ts";
import type { NodeHost } from "./host.ts";
import { previewCommand } from "./host.ts";

/** What a press on a band holds. */
export interface BandPress {
  /** The view as stored at the press, which the command is built on. */
  readonly view: View;
  readonly timeline: string;
  /** The drawing at the press, which every drop is read against, never a preview's. */
  readonly drawing: Drawing;
  readonly band: BandBox;
  /** The timeline's band order at the press (core's `bandOrderOf`). */
  readonly order: readonly string[];
}

/**
 * The band drag of a block node, attached to the drawing's `<svg>`: a band
 * draws nothing of its own to attach to. It takes a press only where the
 * press hits an offered band of the edited timeline (`hitOf`, which hits a
 * drawn element first), while the canvas moves bands (`rulesOf(...).bands`),
 * and never with Shift, which starts a marquee over the edited block; every
 * other press, a band's on a locked canvas included, is the canvas's (a
 * click selects the band, a drag pans). The press that becomes a drag
 * selects the band, which stays selected. The order follows the pointer's
 * drawing point through the drawing as it was at the press (`bandDrop`),
 * the elements sliding apart in the preview; the release stores it in one
 * `set` (`bandMoveCommand`), nothing for a release in place.
 */
export function bandGesture(host: NodeHost): GestureStrategy<BandPress, readonly string[]> {
  const { actions } = host;
  const command = (press: BandPress, order: readonly string[]) =>
    sameSequence(order, press.order)
      ? null
      : bandMoveCommand(press.view, host.data().block.id, press.timeline, order);
  return {
    takes(event, at) {
      if (event.shiftKey || !actions.rules().bands) return null;
      const { block, drawing, editing } = host.data();
      const hit = hitOf(block.id, drawing, sourceAt(event.target), at.drawing, editing);
      const band = hit.kind === "band" && hit.box !== null && isBand(hit.box) ? hit.box : null;
      if (band === null) return null;
      const view = actions.view();
      const stored = view.blocks[block.id] ?? block;
      const { timeline } = band.band;
      return { view, timeline, drawing, band, order: bandOrderOf(stored.manifest, timeline) };
    },
    start(press) {
      actions.select(qualify(host.data().block.id, press.band.address));
    },
    value: (press, at) =>
      bandDrop(press.drawing, press.band, at.drawing.y, press.order) ?? press.order,
    preview(press, order) {
      const block = host.data().block.id;
      if (order === null) {
        actions.preview(block, null);
        host.slide(false);
        return;
      }
      host.slide(true);
      previewCommand(actions, block, press.view, command(press, order));
    },
    command,
  };
}
