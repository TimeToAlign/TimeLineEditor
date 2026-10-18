/**
 * The flow control band: a timeline's displayed breaks and jumps and those
 * of the segments that join it; the break-label tiers and the flow row,
 * where jumps leave and arrive by rows and breaks end (`docs/drawing.md` in
 * timeskeleton, sections 6.4 and 6.6).
 */

import { bandAddress } from "@timetoalign/tilie-core";
import type { PreparedBand } from "./bands.ts";
import { BREAK_LABEL_OFFSET, LABEL_GAP } from "./constants.ts";
import type { Point } from "./elements.ts";
import { type Extent, labelExtent, Rows, widen } from "./fit.ts";
import { centredLabel } from "./names.ts";
import { add, coordinateValue, exactDistance, midpoint, times } from "./numbers.ts";
import { type Entry, maxSize, type Scope, shown } from "./traversal.ts";

/**
 * The flow control band of the timeline drawn with the line `line` (section
 * 6.4, Flow control, Breaks and Segments without a line): the displayed
 * breaks and jumps of each timeline of `sources`, the line first and then
 * each joined segment, each one's in canonical order. The drawn break
 * labels are placed in that order by first fit into the break-label tiers,
 * `T × h(9)` wide; the flow row lies `T × h(9)` beyond the band's start. The
 * jumps, sorted stably by span (the exact absolute difference of their to
 * and from positions), smallest first, are placed in that order by first fit
 * with the extent from the smaller to the larger of their from and to,
 * widened to their drawn label's extent, into the jump rows; row `k` has its
 * apex `f0 + 8 × v + (k − 1) × pj` out, `pj = 10 × v + h(9)`. The band is `T
 * × h(9) + 8 × v + (K − 1) × pj + 2 + h(9)` wide for `K ≥ 1` jump rows and
 * `T × h(9)` for none; 9 is the largest font size of its drawn jump and
 * break labels together. A break runs from the flow row to `at.breakEnd`,
 * its label starting at `x + 3` in its tier, tier 1 touching the flow row on
 * the line's side of it.
 */
export function flowControlBand(
  scope: Scope,
  line: Entry,
  sources: readonly Entry[],
): PreparedBand {
  const { address, owned, measured, relativeX, u, v, h, a, d } = scope;
  const held = sources.filter((source) => shown(source.bands.flow_control.style));
  const own = (source: Entry, value: Parameters<typeof coordinateValue>[0]) =>
    add(source.start, coordinateValue(value, source.manifest.number_type));
  const breaks = held.flatMap((source) =>
    source.manifest.flow_control.breaks
      .map((item) => ({
        ...owned("break", address(item.id), source, "flow_control"),
        at: own(source, item.coordinate),
        text: item.label,
      }))
      .filter((item) => shown(item.style)),
  );
  const jumps = held.flatMap((source) =>
    source.manifest.flow_control.jumps
      .map((item) => ({
        ...owned("jump", address(item.id), source, "flow_control"),
        from: own(source, item.from_coordinate),
        to: own(source, item.to_coordinate),
        text: item.label ?? item.control_type,
      }))
      .filter((item) => shown(item.style)),
  );

  // The drawn break labels, by first fit into the break-label tiers.
  const tiers = new Rows();
  const labelledBreaks = breaks.flatMap((item) => {
    if (item.text === null || !shown(item.label.style)) return [];
    const text = measured(item.label, item.text);
    const left = relativeX(item.at) + BREAK_LABEL_OFFSET;
    const extent: Extent = [left - 1, left + text.width + 1];
    return [{ item, text, extent, tier: tiers.place(extent) }];
  });

  // The jumps, sorted stably by span, then by first fit into the jump rows.
  const rows = new Rows();
  const placedJumps = jumps
    .map((jump, index) => ({ jump, index, span: exactDistance(jump.to, jump.from) }))
    .sort((left, right) => left.span.compare(right.span) || left.index - right.index)
    .map(({ jump }) => {
      const middle = midpoint(jump.from, jump.to);
      const label = shown(jump.label.style) ? measured(jump.label, jump.text) : undefined;
      const xFrom = relativeX(jump.from);
      const xTo = relativeX(jump.to);
      let extent: Extent = [Math.min(xFrom, xTo), Math.max(xFrom, xTo)];
      if (label !== undefined) extent = widen(extent, labelExtent(relativeX(middle), label.width));
      return { jump, middle, label, extent, row: rows.place(extent) };
    });

  const size = maxSize([
    ...placedJumps.flatMap((item) => (item.label === undefined ? [] : [item.jump.label])),
    ...labelledBreaks.map((item) => item.item.label),
  ]);
  const tierRoom = tiers.count * h(size);
  const pj = 10 * v + h(size);
  const K = rows.count;
  return {
    kind: "flow_control",
    address: bandAddress(line.manifest.id, "flow_control"),
    elements: breaks.length + jumps.length,
    width: K === 0 ? tierRoom : tierRoom + 8 * v + (K - 1) * pj + LABEL_GAP + h(size),
    extents: [
      ...breaks.map((item): Extent => [relativeX(item.at), relativeX(item.at)]),
      ...labelledBreaks.map((item) => item.extent),
      ...placedJumps.map((item) => item.extent),
    ],
    centred: placedJumps.flatMap((item) =>
      item.label === undefined ? [] : [{ width: item.label.width, u: u(item.middle) }],
    ),
    draw: (start, side, at) => {
      const f0 = start + tierRoom;
      const yf = at.yAt(side, f0);
      const apex = (row: number) => f0 + 8 * v + (row - 1) * pj;
      return {
        breaks: breaks.map((item) => ({
          type: "break",
          address: item.address,
          style: item.style,
          x: at.x(item.at),
          y1: yf,
          y2: at.breakEnd(side),
        })),
        jumps: placedJumps.map(({ jump, row }) => {
          const ya = at.yAt(side, apex(row));
          const w = jump.style["stroke-width"];
          const xf = at.x(jump.from);
          const xt = at.x(jump.to);
          const q = (xt - xf) / 4;
          const yc = yf + times(4n, 3n, ya - yf);
          const cx = xt - q;
          // The head points along the curve's direction at its end, from C2 to P3.
          const length = Math.sqrt((xt - cx) * (xt - cx) + (yf - yc) * (yf - yc));
          const ux = (xt - cx) / length;
          const uy = (yf - yc) / length;
          const base: Point = [xt - 4 * w * ux, yf - 4 * w * uy];
          const [nx, ny] = [-uy, ux];
          return {
            type: "jump",
            address: jump.address,
            style: jump.style,
            start: [xf, yf],
            c1: [xf + q, yc],
            c2: [cx, yc],
            tip: [xt, yf],
            base,
            corners: [
              [base[0] - 2 * w * nx, base[1] - 2 * w * ny],
              [base[0] + 2 * w * nx, base[1] + 2 * w * ny],
            ],
          };
        }),
        jumpLabels: placedJumps.flatMap(({ jump, middle, label, row }) =>
          label === undefined
            ? []
            : [
                centredLabel(
                  jump.label,
                  at.x(middle),
                  at.beyond(side, at.yAt(side, apex(row) + LABEL_GAP), size),
                  label,
                ),
              ],
        ),
        // Tier 1 touches the flow row on the line's side; tier k lies (k − 1) h further in.
        breakLabels: labelledBreaks.map(({ item, text, tier }) => {
          const inwards = (tier - 1) * h(size);
          return {
            type: "label",
            address: item.label.address,
            style: item.label.style,
            x: at.x(item.at) + BREAK_LABEL_OFFSET,
            baseline: side === "below" ? yf - inwards - d(size) : yf + inwards + a(size),
            anchor: "start",
            text: text.clean,
          };
        }),
      };
    },
  };
}
